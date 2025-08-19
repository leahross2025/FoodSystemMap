// Activities Matrix Visualization using D3.js Heatmap
export function createActivitiesVisualization(selector, data) {
  // Clear any existing content
  d3.select(selector).selectAll("*").remove();

  const container = d3.select(selector);
  const containerRect = container.node().getBoundingClientRect();
  
  // Set dimensions
  const margin = { top: 60, right: 20, bottom: 120, left: 150 };
  const cellSize = 15;
  const width = Math.max(400, data.activities.length * cellSize);
  const height = Math.max(300, data.matrix.length * cellSize);

  // Create SVG with scrollable container if needed
  const svgContainer = container.append("div")
    .style("overflow-x", "auto")
    .style("overflow-y", "auto")
    .style("max-height", "500px")
    .style("border", "1px solid #e2e8f0")
    .style("border-radius", "4px");

  const svg = svgContainer
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom);

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // Color scales
  const sectorColors = {
    'Nonprofit': '#38a169',
    'Government': '#3182ce',
    'Foundation': '#805ad5',
    'Academic': '#dd6b20',
    'Unknown': '#718096'
  };

  // Create scales
  const xScale = d3.scaleBand()
    .domain(data.activities)
    .range([0, width])
    .padding(0.05);

  const yScale = d3.scaleBand()
    .domain(data.matrix.map(d => d.organization))
    .range([0, height])
    .padding(0.05);

  // Create tooltip
  const tooltip = d3.select("body").append("div")
    .attr("class", "activities-tooltip")
    .style("opacity", 0)
    .style("position", "absolute")
    .style("background", "rgba(0, 0, 0, 0.8)")
    .style("color", "white")
    .style("padding", "10px")
    .style("border-radius", "5px")
    .style("font-size", "12px")
    .style("pointer-events", "none")
    .style("z-index", "1000")
    .style("max-width", "250px");

  // Create cells
  data.matrix.forEach(org => {
    const row = g.selectAll(`.row-${org.organization.replace(/\s+/g, '-')}`)
      .data(org.activities)
      .enter().append("rect")
      .attr("class", `cell row-${org.organization.replace(/\s+/g, '-')}`)
      .attr("x", d => xScale(d.activity))
      .attr("y", yScale(org.organization))
      .attr("width", xScale.bandwidth())
      .attr("height", yScale.bandwidth())
      .attr("fill", d => d.value ? sectorColors[org.sector] || sectorColors['Unknown'] : '#f7fafc')
      .attr("stroke", "#fff")
      .attr("stroke-width", 1)
      .style("cursor", "pointer")
      .style("opacity", d => d.value ? 0.8 : 0.3);

    // Add hover interactions
    row
      .on("mouseover", function(event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .style("opacity", 1)
          .attr("stroke-width", 2)
          .attr("stroke", "#2d3748");

        tooltip.transition()
          .duration(200)
          .style("opacity", .9);
        
        tooltip.html(`
          <strong>${org.organization}</strong><br/>
          Sector: ${org.sector}<br/>
          Activity: ${d.activity}<br/>
          Status: ${d.value ? 'Active' : 'Not Active'}
        `)
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 28) + "px");
      })
      .on("mouseout", function(event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .style("opacity", d.value ? 0.8 : 0.3)
          .attr("stroke-width", 1)
          .attr("stroke", "#fff");

        tooltip.transition()
          .duration(500)
          .style("opacity", 0);
      });
  });

  // Add x-axis (activities)
  const xAxis = g.append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0, ${height})`);

  xAxis.selectAll(".activity-label")
    .data(data.activities)
    .enter().append("text")
    .attr("class", "activity-label")
    .attr("x", d => xScale(d) + xScale.bandwidth() / 2)
    .attr("y", 15)
    .attr("transform", d => `rotate(-45, ${xScale(d) + xScale.bandwidth() / 2}, 15)`)
    .style("text-anchor", "end")
    .style("font-size", "10px")
    .style("fill", "#4a5568")
    .text(d => d.length > 20 ? d.substring(0, 20) + "..." : d);

  // Add y-axis (organizations)
  const yAxis = g.append("g")
    .attr("class", "y-axis");

  yAxis.selectAll(".org-label")
    .data(data.matrix)
    .enter().append("text")
    .attr("class", "org-label")
    .attr("x", -10)
    .attr("y", d => yScale(d.organization) + yScale.bandwidth() / 2)
    .attr("dy", ".35em")
    .style("text-anchor", "end")
    .style("font-size", "10px")
    .style("fill", "#4a5568")
    .text(d => d.organization.length > 25 ? d.organization.substring(0, 25) + "..." : d.organization);

  // Add sector color indicators
  yAxis.selectAll(".sector-indicator")
    .data(data.matrix)
    .enter().append("rect")
    .attr("class", "sector-indicator")
    .attr("x", -25)
    .attr("y", d => yScale(d.organization) + 2)
    .attr("width", 8)
    .attr("height", yScale.bandwidth() - 4)
    .attr("fill", d => sectorColors[d.sector] || sectorColors['Unknown']);

  // Create legend
  const legend = svg.append("g")
    .attr("class", "legend")
    .attr("transform", `translate(20, 20)`);

  legend.append("text")
    .attr("x", 0)
    .attr("y", 0)
    .text("Sector")
    .style("font-weight", "bold")
    .style("font-size", "12px")
    .style("fill", "#2d3748");

  const sectorLegend = legend.selectAll(".sector-legend")
    .data(Object.entries(sectorColors))
    .enter().append("g")
    .attr("class", "sector-legend")
    .attr("transform", (d, i) => `translate(0, ${20 + i * 18})`);

  sectorLegend.append("rect")
    .attr("width", 12)
    .attr("height", 12)
    .attr("fill", d => d[1]);

  sectorLegend.append("text")
    .attr("x", 16)
    .attr("y", 6)
    .attr("dy", ".35em")
    .style("font-size", "11px")
    .style("fill", "#4a5568")
    .text(d => d[0]);

  // Add activity summary
  const activitySummary = data.activities.map(activity => {
    const count = data.matrix.reduce((sum, org) => {
      const activityData = org.activities.find(a => a.activity === activity);
      return sum + (activityData && activityData.value ? 1 : 0);
    }, 0);
    return { activity, count };
  }).sort((a, b) => b.count - a.count);

  // Add summary text
  container.append("div")
    .style("margin-top", "15px")
    .style("font-size", "12px")
    .style("color", "#718096")
    .html(`
      <div style="display: flex; justify-content: space-between; flex-wrap: wrap; gap: 20px;">
        <div>
          <strong>Most Common Activity:</strong><br/>
          ${activitySummary[0].activity} (${activitySummary[0].count} orgs)
        </div>
        <div>
          <strong>Total Organizations:</strong> ${data.matrix.length}<br/>
          <strong>Total Activities:</strong> ${data.activities.length}
        </div>
      </div>
    `);

  // Add controls
  const controls = container.append("div")
    .style("margin-top", "10px")
    .style("text-align", "center");

  // Filter by sector
  const sectorSelect = controls.append("select")
    .style("padding", "5px")
    .style("margin", "0 10px")
    .style("border", "1px solid #e2e8f0")
    .style("border-radius", "4px");

  sectorSelect.append("option")
    .attr("value", "all")
    .text("All Sectors");

  Object.keys(sectorColors).forEach(sector => {
    if (sector !== 'Unknown') {
      sectorSelect.append("option")
        .attr("value", sector)
        .text(sector);
    }
  });

  sectorSelect.on("change", function() {
    const selectedSector = this.value;
    
    if (selectedSector === "all") {
      g.selectAll(".cell").style("display", "block");
      g.selectAll(".org-label").style("display", "block");
      g.selectAll(".sector-indicator").style("display", "block");
    } else {
      data.matrix.forEach(org => {
        const display = org.sector === selectedSector ? "block" : "none";
        g.selectAll(`.row-${org.organization.replace(/\s+/g, '-')}`).style("display", display);
        g.selectAll(".org-label")
          .filter(d => d.organization === org.organization)
          .style("display", display);
        g.selectAll(".sector-indicator")
          .filter(d => d.organization === org.organization)
          .style("display", display);
      });
    }
  });

  // Cleanup function
  return () => {
    tooltip.remove();
  };
}
