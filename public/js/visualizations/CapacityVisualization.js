// Capacity Building Needs Visualization using D3.js Radar Chart
export function createCapacityVisualization(selector, data) {
  // Clear any existing content
  d3.select(selector).selectAll("*").remove();

  const container = d3.select(selector);
  const containerRect = container.node().getBoundingClientRect();
  
  // Process data for radar chart
  const needsData = Object.entries(data.needsCounts)
    .map(([need, count]) => ({
      need: need.length > 30 ? need.substring(0, 30) + "..." : need,
      fullNeed: need,
      count: count,
      percentage: (count / d3.sum(Object.values(data.needsCounts)) * 100).toFixed(1)
    }))
    .sort((a, b) => b.count - a.count);

  // Set dimensions
  const width = Math.min(containerRect.width, 400);
  const height = 350;
  const radius = Math.min(width, height) / 2 - 60;
  const centerX = width / 2;
  const centerY = height / 2;

  // Create SVG
  const svg = container
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .style("display", "block")
    .style("margin", "0 auto");

  const g = svg.append("g")
    .attr("transform", `translate(${centerX},${centerY})`);

  // Create scales
  const angleScale = d3.scaleLinear()
    .domain([0, needsData.length])
    .range([0, 2 * Math.PI]);

  const radiusScale = d3.scaleLinear()
    .domain([0, d3.max(needsData, d => d.count)])
    .range([0, radius]);

  // Color scale
  const colorScale = d3.scaleOrdinal()
    .domain(needsData.map(d => d.need))
    .range(d3.schemeCategory10);

  // Create tooltip
  const tooltip = d3.select("body").append("div")
    .attr("class", "capacity-tooltip")
    .style("opacity", 0)
    .style("position", "absolute")
    .style("background", "rgba(0, 0, 0, 0.8)")
    .style("color", "white")
    .style("padding", "10px")
    .style("border-radius", "5px")
    .style("font-size", "12px")
    .style("pointer-events", "none")
    .style("z-index", "1000")
    .style("max-width", "300px");

  // Draw concentric circles (grid)
  const levels = 5;
  for (let i = 1; i <= levels; i++) {
    g.append("circle")
      .attr("r", (radius / levels) * i)
      .attr("fill", "none")
      .attr("stroke", "#e2e8f0")
      .attr("stroke-width", 1);
  }

  // Draw axis lines
  needsData.forEach((d, i) => {
    const angle = angleScale(i) - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    
    g.append("line")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", x)
      .attr("y2", y)
      .attr("stroke", "#e2e8f0")
      .attr("stroke-width", 1);
  });

  // Create data points
  const dataPoints = needsData.map((d, i) => {
    const angle = angleScale(i) - Math.PI / 2;
    const r = radiusScale(d.count);
    return {
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
      ...d
    };
  });

  // Draw the radar area
  const line = d3.line()
    .x(d => d.x)
    .y(d => d.y)
    .curve(d3.curveLinearClosed);

  g.append("path")
    .datum(dataPoints)
    .attr("d", line)
    .attr("fill", "#38a169")
    .attr("fill-opacity", 0.2)
    .attr("stroke", "#38a169")
    .attr("stroke-width", 2);

  // Add data points
  const points = g.selectAll(".data-point")
    .data(dataPoints)
    .enter().append("circle")
    .attr("class", "data-point")
    .attr("cx", d => d.x)
    .attr("cy", d => d.y)
    .attr("r", 4)
    .attr("fill", d => colorScale(d.need))
    .attr("stroke", "white")
    .attr("stroke-width", 2)
    .style("cursor", "pointer");

  // Add hover interactions to points
  points
    .on("mouseover", function(event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr("r", 6);

      tooltip.transition()
        .duration(200)
        .style("opacity", .9);
      
      // Show sector breakdown if available
      let sectorBreakdown = "";
      if (data.needsBySector) {
        const sectors = Object.keys(data.needsBySector);
        const breakdown = sectors.map(sector => {
          const count = data.needsBySector[sector][d.fullNeed] || 0;
          return count > 0 ? `${sector}: ${count}` : null;
        }).filter(Boolean);
        
        if (breakdown.length > 0) {
          sectorBreakdown = "<br/><br/><strong>By Sector:</strong><br/>" + breakdown.join("<br/>");
        }
      }
      
      tooltip.html(`
        <strong>${d.fullNeed}</strong><br/>
        Organizations: ${d.count}<br/>
        Percentage: ${d.percentage}%${sectorBreakdown}
      `)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");
    })
    .on("mouseout", function(event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr("r", 4);

      tooltip.transition()
        .duration(500)
        .style("opacity", 0);
    });

  // Add labels
  needsData.forEach((d, i) => {
    const angle = angleScale(i) - Math.PI / 2;
    const labelRadius = radius + 20;
    const x = Math.cos(angle) * labelRadius;
    const y = Math.sin(angle) * labelRadius;
    
    g.append("text")
      .attr("x", x)
      .attr("y", y)
      .attr("dy", ".35em")
      .style("text-anchor", x > 0 ? "start" : "end")
      .style("font-size", "10px")
      .style("fill", "#4a5568")
      .text(d.need);
  });

  // Add scale labels
  for (let i = 1; i <= levels; i++) {
    const value = Math.round((d3.max(needsData, d => d.count) / levels) * i);
    g.append("text")
      .attr("x", 5)
      .attr("y", -(radius / levels) * i)
      .attr("dy", ".35em")
      .style("font-size", "9px")
      .style("fill", "#718096")
      .text(value);
  }

  // Create bar chart for comparison
  const barContainer = container.append("div")
    .style("margin-top", "20px");

  const barData = needsData.slice(0, 5); // Top 5 needs

  const barSvg = barContainer
    .append("svg")
    .attr("width", width)
    .attr("height", 150);

  const barMargin = { top: 10, right: 20, bottom: 30, left: 100 };
  const barWidth = width - barMargin.left - barMargin.right;
  const barHeight = 150 - barMargin.top - barMargin.bottom;

  const barG = barSvg.append("g")
    .attr("transform", `translate(${barMargin.left},${barMargin.top})`);

  const xBarScale = d3.scaleLinear()
    .domain([0, d3.max(barData, d => d.count)])
    .range([0, barWidth]);

  const yBarScale = d3.scaleBand()
    .domain(barData.map(d => d.need))
    .range([0, barHeight])
    .padding(0.2);

  // Create bars
  const bars = barG.selectAll(".bar")
    .data(barData)
    .enter().append("rect")
    .attr("class", "bar")
    .attr("x", 0)
    .attr("y", d => yBarScale(d.need))
    .attr("width", 0)
    .attr("height", yBarScale.bandwidth())
    .attr("fill", d => colorScale(d.need))
    .style("cursor", "pointer");

  // Animate bars
  bars.transition()
    .duration(1000)
    .delay((d, i) => i * 100)
    .attr("width", d => xBarScale(d.count));

  // Add bar labels
  barG.selectAll(".bar-label")
    .data(barData)
    .enter().append("text")
    .attr("class", "bar-label")
    .attr("x", d => xBarScale(d.count) + 5)
    .attr("y", d => yBarScale(d.need) + yBarScale.bandwidth() / 2)
    .attr("dy", ".35em")
    .style("font-size", "11px")
    .style("fill", "#2d3748")
    .style("opacity", 0)
    .text(d => d.count);

  // Animate labels
  barG.selectAll(".bar-label")
    .transition()
    .duration(1000)
    .delay((d, i) => i * 100 + 500)
    .style("opacity", 1);

  // Add y-axis for bars
  const yBarAxis = d3.axisLeft(yBarScale)
    .tickSize(0)
    .tickPadding(10);

  barG.append("g")
    .attr("class", "y-axis")
    .call(yBarAxis)
    .selectAll("text")
    .style("font-size", "10px")
    .style("fill", "#4a5568");

  barG.select(".y-axis .domain").remove();

  // Add hover interactions to bars
  bars
    .on("mouseover", function(event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr("fill", d3.color(colorScale(d.need)).darker(0.3));

      tooltip.transition()
        .duration(200)
        .style("opacity", .9);
      
      tooltip.html(`
        <strong>${d.fullNeed}</strong><br/>
        Organizations: ${d.count}<br/>
        Percentage: ${d.percentage}%
      `)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");
    })
    .on("mouseout", function(event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr("fill", colorScale(d.need));

      tooltip.transition()
        .duration(500)
        .style("opacity", 0);
    });

  // Add summary text
  container.append("div")
    .style("margin-top", "15px")
    .style("text-align", "center")
    .style("font-size", "12px")
    .style("color", "#718096")
    .html(`
      <strong>Top Need:</strong> ${needsData[0].fullNeed} (${needsData[0].count} organizations)<br/>
      <strong>Total Responses:</strong> ${d3.sum(needsData, d => d.count)} capacity building requests
    `);

  // Cleanup function
  return () => {
    tooltip.remove();
  };
}
