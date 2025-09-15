import * as XLSX from 'xlsx';

// Data processing utilities for D3 visualizations
export class SurveyDataProcessor {
  constructor(excelData) {
    this.rawData = excelData;
    this.processedData = this.parseExcel(excelData);
  }

  parseExcel(excelData) {
    try {
      // Read the Excel file
      const workbook = XLSX.read(excelData, { type: 'array' });
      
      // Get the "Copy of Survey Responses" sheet
      const sheetName = 'Copy of Survey Responses';
      if (!workbook.SheetNames.includes(sheetName)) {
        console.error(`Sheet "${sheetName}" not found. Available sheets:`, workbook.SheetNames);
        // Fallback to first sheet if "Copy of Survey Responses" doesn't exist
        const fallbackSheet = workbook.SheetNames[0];
        console.log(`Using fallback sheet: ${fallbackSheet}`);
        const worksheet = workbook.Sheets[fallbackSheet];
        return this.processWorksheet(worksheet);
      }
      
      const worksheet = workbook.Sheets[sheetName];
      return this.processWorksheet(worksheet);
    } catch (error) {
      console.error('Error parsing Excel data:', error);
      return [];
    }
  }

  processWorksheet(worksheet) {
    // Convert worksheet to JSON with header row
    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
      header: 1, // Use first row as headers
      defval: '', // Default value for empty cells
      blankrows: false // Skip blank rows
    });

    if (jsonData.length === 0) return [];

    // Get headers from first row and clean them up
    const headers = jsonData[0].map(header => {
      if (!header) return 'Unknown_Column';
      return header.toString().trim().replace(/\s+/g, '_').replace(/[^\w]/g, '_');
    });

    // Convert remaining rows to objects
    const processedData = [];
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (row.length === 0 || row.every(cell => !cell)) continue; // Skip empty rows
      
      const rowObject = {};
      headers.forEach((header, index) => {
        rowObject[header] = row[index] || '';
      });
      
      // Only include rows that have an organization name
      if (rowObject.Organization_Name && rowObject.Organization_Name.trim()) {
        processedData.push(rowObject);
      }
    }

    console.log(`Processed ${processedData.length} organizations from Excel sheet`);
    return processedData;
  }

  // Get organization network data for force-directed graph
  getNetworkData() {
    const nodes = this.processedData.map((org, index) => ({
      id: index,
      name: org.Organization_Name || 'Unknown',
      sector: this.normalizeSector(org.Sector),
      district: this.extractPrimaryDistrict(org.Primary_Supervisorial_District__based_on_headquarters_address_),
      scope: this.calculateScope(org),
      goals: this.parseMultiSelect(org.Which_of_the_following_LA_County_Roundtable_Action_Plan_GOALS_does_your_organization_help_advance__mark_all_that_apply_),
      activities: this.parseMultiSelect(org.How_would_you_describe_the_activities_of_your_organization_check_all_that_apply_as_related_to_the_food_system_),
      primaryGoal: org.If_you_had_to_choose_the_goal_MOST_aligned_with_your_organization__which_one_would_it_be_,
      challenges: this.parseMultiSelect(org.What_are_the_biggest_challenges_your_organization_faces_in_collaborating_with_others_in_the_food_system__Select_up_to_3_),
      website: org.Website || '',
      size: this.calculateNodeSize(org)
    }));

    // Create links based on shared goals and activities
    const links = this.generateLinks(nodes);

    return { nodes, links };
  }

  // Get goal alignment data for sunburst chart
  getGoalAlignmentData() {
    const goalCounts = {};
    const objectiveCounts = {};

    this.processedData.forEach(org => {
      const goals = this.parseMultiSelect(org.Which_of_the_following_LA_County_Roundtable_Action_Plan_GOALS_does_your_organization_help_advance__mark_all_that_apply_);
      const objectives = this.parseMultiSelect(org.Which_of_the_following_LA_County_Roundtable_Action_Plan_OBJECTIVES_does_your_organization_help_advance__mark_all_that_apply_);

      goals.forEach(goal => {
        goalCounts[goal] = (goalCounts[goal] || 0) + 1;
      });

      objectives.forEach(objective => {
        objectiveCounts[objective] = (objectiveCounts[objective] || 0) + 1;
      });
    });

    return this.buildHierarchy(goalCounts, objectiveCounts);
  }

  // Get activity matrix data for heatmap
  getActivityMatrixData() {
    const activities = new Set();
    const organizations = [];

    this.processedData.forEach(org => {
      const orgActivities = this.parseMultiSelect(org.How_would_you_describe_the_activities_of_your_organization_check_all_that_apply_as_related_to_the_food_system_);
      orgActivities.forEach(activity => activities.add(activity));
      
      organizations.push({
        name: org.Organization_Name || 'Unknown',
        sector: this.normalizeSector(org.Sector),
        activities: orgActivities
      });
    });

    const activityList = Array.from(activities).sort();
    
    const matrix = organizations.map(org => ({
      organization: org.name,
      sector: org.sector,
      activities: activityList.map(activity => ({
        activity,
        value: org.activities.includes(activity) ? 1 : 0
      }))
    }));

    return { matrix, activities: activityList };
  }

  // Get collaboration challenges data
  getChallengesData() {
    const challengeCounts = {};
    const challengesBySector = {};

    this.processedData.forEach(org => {
      const sector = this.normalizeSector(org.Sector);
      const challenges = this.parseMultiSelect(org.What_are_the_biggest_challenges_your_organization_faces_in_collaborating_with_others_in_the_food_system__Select_up_to_3_);
      
      if (!challengesBySector[sector]) {
        challengesBySector[sector] = {};
      }

      challenges.forEach(challenge => {
        challengeCounts[challenge] = (challengeCounts[challenge] || 0) + 1;
        challengesBySector[sector][challenge] = (challengesBySector[sector][challenge] || 0) + 1;
      });
    });

    return { challengeCounts, challengesBySector };
  }

  // Get capacity building needs data
  getCapacityNeedsData() {
    const needsCounts = {};
    const needsBySector = {};

    this.processedData.forEach(org => {
      const sector = this.normalizeSector(org.Sector);
      const needs = this.parseMultiSelect(org.What_types_of_capacity_building_tools_or_support_would_be_most_helpful__Select_up_to_3_);
      
      if (!needsBySector[sector]) {
        needsBySector[sector] = {};
      }

      needs.forEach(need => {
        needsCounts[need] = (needsCounts[need] || 0) + 1;
        needsBySector[sector][need] = (needsBySector[sector][need] || 0) + 1;
      });
    });

    return { needsCounts, needsBySector };
  }

  // Get geographic flow data for Sankey diagram
  getGeographicFlowData() {
    const flows = [];
    
    this.processedData.forEach(org => {
      const primaryDistrict = this.extractPrimaryDistrict(org.Primary_Supervisorial_District__based_on_headquarters_address_);
      const servedDistricts = this.parseMultiSelect(org.Other_Supervisorial_District_s__Served_all_districts_where_programs_and_services_are_provided_);
      
      servedDistricts.forEach(served => {
        if (served !== primaryDistrict && served !== 'Countywide') {
          flows.push({
            source: primaryDistrict,
            target: served,
            value: 1,
            organization: org.Organization_Name
          });
        }
      });
    });

    return this.aggregateFlows(flows);
  }

  // Helper methods
  parseMultiSelect(field) {
    if (!field) return [];
    return field.split(',').map(item => item.trim()).filter(item => item.length > 0);
  }

  normalizeSector(sector) {
    if (!sector) return 'Unknown';
    const sectorMap = {
      'Nonprofit/CBO': 'Nonprofit',
      'Government Agency': 'Government',
      'Foundation': 'Foundation',
      'College/University': 'Academic'
    };
    return sectorMap[sector] || sector;
  }

  extractPrimaryDistrict(districtField) {
    if (!districtField) return 'Unknown';
    if (districtField.includes('Countywide')) return 'Countywide';
    
    const match = districtField.match(/(\d+)(st|nd|rd|th)\s+District/);
    return match ? `District ${match[1]}` : 'Unknown';
  }

  calculateScope(org) {
    const served = this.parseMultiSelect(org.Other_Supervisorial_District_s__Served_all_districts_where_programs_and_services_are_provided_);
    if (served.includes('Countywide') || served.length >= 4) return 'Countywide';
    if (served.length >= 2) return 'Multi-District';
    return 'Single District';
  }

  calculateNodeSize(org) {
    const activities = this.parseMultiSelect(org.How_would_you_describe_the_activities_of_your_organization_check_all_that_apply_as_related_to_the_food_system_);
    const served = this.parseMultiSelect(org.Other_Supervisorial_District_s__Served_all_districts_where_programs_and_services_are_provided_);
    return Math.max(5, Math.min(20, activities.length * 2 + served.length));
  }

  generateLinks(nodes) {
    const links = [];
    
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const nodeA = nodes[i];
        const nodeB = nodes[j];
        
        // Calculate similarity based on shared goals and activities
        const sharedGoals = nodeA.goals.filter(goal => nodeB.goals.includes(goal)).length;
        const sharedActivities = nodeA.activities.filter(activity => nodeB.activities.includes(activity)).length;
        
        const similarity = sharedGoals * 2 + sharedActivities;
        
        if (similarity >= 3) { // Threshold for creating a link
          links.push({
            source: i,
            target: j,
            strength: similarity,
            sharedGoals: sharedGoals,
            sharedActivities: sharedActivities
          });
        }
      }
    }
    
    return links;
  }

  buildHierarchy(goalCounts, objectiveCounts) {
    const goalMapping = {
      'Improve affordability of healthy foods': 'Affordability',
      'Increase equitable access to healthy foods': 'Access',
      'Build market demand and consumption of healthy foods': 'Demand',
      'Support sustainability and resilience in food systems and supply chains': 'Sustainability'
    };

    const children = Object.entries(goalCounts).map(([goal, count]) => ({
      name: goalMapping[goal] || goal,
      value: count,
      fullName: goal
    }));

    return {
      name: 'Food System Goals',
      children: children
    };
  }

  aggregateFlows(flows) {
    const flowMap = {};
    
    flows.forEach(flow => {
      const key = `${flow.source}-${flow.target}`;
      if (!flowMap[key]) {
        flowMap[key] = {
          source: flow.source,
          target: flow.target,
          value: 0,
          organizations: []
        };
      }
      flowMap[key].value += flow.value;
      flowMap[key].organizations.push(flow.organization);
    });

    return Object.values(flowMap);
  }

  // Get summary statistics
  getSummaryStats() {
    const totalOrgs = this.processedData.length;
    const sectorCounts = {};
    const districtCounts = {};

    this.processedData.forEach(org => {
      const sector = this.normalizeSector(org.Sector);
      const district = this.extractPrimaryDistrict(org.Primary_Supervisorial_District__based_on_headquarters_address_);
      
      sectorCounts[sector] = (sectorCounts[sector] || 0) + 1;
      districtCounts[district] = (districtCounts[district] || 0) + 1;
    });

    return {
      totalOrganizations: totalOrgs,
      sectorBreakdown: sectorCounts,
      districtBreakdown: districtCounts
    };
  }
}

// Utility function to load and process Excel data
export async function loadSurveyData() {
  try {
    const response = await fetch('/FINAL- Food Systems Stakeholder Survey (Responses).xlsx');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return new SurveyDataProcessor(arrayBuffer);
  } catch (error) {
    console.error('Error loading survey data:', error);
    return null;
  }
}
