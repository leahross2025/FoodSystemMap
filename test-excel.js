import { SurveyDataProcessor } from './src/scripts/processData.js';
import fs from 'fs';

async function testExcelProcessing() {
  console.log('Testing Excel data processing...');
  
  try {
    // Read the Excel file directly from filesystem
    const excelBuffer = fs.readFileSync('./public/FINAL- Food Systems Stakeholder Survey (Responses).xlsx');
    const processor = new SurveyDataProcessor(excelBuffer);
    
    if (!processor) {
      console.error('Failed to load survey data');
      return;
    }
    
    console.log('✅ Excel file loaded successfully');
    console.log(`📊 Processed ${processor.processedData.length} organizations`);
    
    // Show first few organizations
    if (processor.processedData.length > 0) {
      console.log('\n📋 Sample organizations:');
      processor.processedData.slice(0, 3).forEach((org, index) => {
        console.log(`${index + 1}. ${org.Organization_Name || 'Unknown'}`);
        console.log(`   Sector: ${org.Sector || 'Unknown'}`);
        console.log(`   District: ${org.Primary_Supervisorial_District__based_on_headquarters_address_ || 'Unknown'}`);
        console.log('');
      });
    }
    
    // Test summary stats
    const stats = processor.getSummaryStats();
    console.log('📈 Summary Statistics:');
    console.log(`Total Organizations: ${stats.totalOrganizations}`);
    console.log('Sector Breakdown:', stats.sectorBreakdown);
    console.log('District Breakdown:', stats.districtBreakdown);
    
  } catch (error) {
    console.error('❌ Error testing Excel processing:', error);
  }
}

testExcelProcessing();
