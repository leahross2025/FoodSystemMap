// Challenges Visualization using D3.js Horizontal Bar Chart
export function createChallengesVisualization(selector, data) {
  // Clear any existing content
  d3.select(selector).selectAll("*").remove();

  const container = d3.select(selector);
  const containerRect = container.node().getBoundingClientRect();
  
  // Process data
  const challengeData = Object.entries(data.challengeCounts)
    .map(([challenge, count]) => ({
      challenge: challenge.length > 40 ? challenge.substring(0, 40) + "..." : challenge,
      fullChallenge: challenge,
      count: count,
      percentage: (count / d3.sum(Object.values(data.challengeCounts)) * 100).toFixed(1)
    }))
    .sort((a, b) => b.count - a.count);

  // Set dimensions
  const margin = { top: 20, right: 60, bottom: 40, left: 200 };
  const width = containerRect.width - margin.left - margin.right;
  const height = Math.max(300, challengeData.length * 40) - margin.top - margin.bottom;

  // Create SVG
  const svg = container
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom);

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // Create scales
  const xScale = d3.scaleLinear()
    .domain([0, d3.max(challengeData, d => d.count)])
    .range([0, width]);

  const yScale = d3.scaleBand()
    .domain(challengeData.map(d => d.challenge))
    .range([0, height])
    .padding(0.2);

  const colorScale = d3.scaleSequential()
    .domain([0, d3.max(challengeData, d => d.count)])
    .interpolator(d3.interpolateReds);

  // Create tooltip
  const tooltip = d3.select("body").append("div")
    .attr("class", "challenges-tooltip")
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

  // Create bars
  const bars = g.selectAll(".bar")
    .data(challengeData)
    .enter().append("rect")
    .attr("class", "bar")
    .attr("x", 0)
    .attr("y", d => yScale(d.challenge))
    .attr("width", 0)
    .attr("height", yScale.bandwidth())
    .attr("fill", d => colorScale(d.count))
    .attr("stroke", "#fff")
    .attr("stroke-width", 1)
    .style("cursor", "pointer");

  // Animate bars
  bars.transition()
    .duration(1000)
    .delay((d, i) => i * 100)
    .attr("width", d => xScale(d.count));

  // Add value labels
  const labels = g.selectAll(".label")
    .data(challengeData)
    .enter().append("text")
    .attr("class", "label")
    .attr("x", d => xScale(d.count) + 5)
    .attr("y", d => yScale(d.challenge) + yScale.bandwidth() / 2)
    .attr("dy", ".35em")
    .style("font-size", "12px")
    .style("font-weight", "bold")
    .style("fill", "#2d3748")
    .style("opacity", 0)
    .text(d => `${d.count} (${d.percentage}%)`);

  // Animate labels
  labels.transition()
    .duration(1000)
    .delay((d, i) => i * 100 + 500)
    .style("opacity", 1);

  // Add y-axis
  const yAxis = d3.axisLeft(yScale)
    .tickSize(0)
    .tickPadding(10);

  g.append("g")
    .attr("class", "y-axis")
    .call(yAxis)
    .selectAll("text")
    .style("font-size", "11px")
    .style("fill", "#4a5568");

  // Remove y-axis line
  g.select(".y-axis .domain").remove();

  // Add x-axis
  const xAxis = d3.axisBottom(xScale)
    .ticks(5)
    .tickFormat(d => d);

  g.append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0,${height})`)
    .call(xAxis)
    .selectAll("text")
    .style("font-size", "11px")
    .style("fill", "#4a5568");

  // Style x-axis
  g.select(".x-axis .domain")
    .style("stroke", "#e2e8f0");

  g.selectAll(".x-axis .tick line")
    .style("stroke", "#e2e8f0");

  // Add x-axis label
  g.append("text")
    .attr("transform", `translate(${width / 2}, ${height + 35})`)
    .style("text-anchor", "middle")
    .style("font-size", "12px")
    .style("fill", "#718096")
    .text("Number of Organizations");

  // Add hover interactions
  bars
    .on("mouseover", function(event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr("fill", d3.color(colorScale(d.count)).darker(0.3));

      tooltip.transition()
        .duration(200)
        .style("opacity", .9);
      
      // Show sector breakdown if available
      let sectorBreakdown = "";
      if (data.challengesBySector) {
        const sectors = Object.keys(data.challengesBySector);
        const breakdown = sectors.map(sector => {
          const count = data.challengesBySector[sector][d.fullChallenge] || 0;
          return count > 0 ? `${sector}: ${count}` : null;
        }).filter(Boolean);
        
        if (breakdown.length > 0) {
          sectorBreakdown = "<br/><br/><strong>By Sector:</strong><br/>" + breakdown.join("<br/>");
        }
      }
      
      tooltip.html(`
        <strong>${d.fullChallenge}</strong><br/>
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
        .attr("fill", colorScale(d.count));

      tooltip.transition()
        .duration(500)
        .style("opacity", 0);
    });

  // Add grid lines
  const gridlines = g.append("g")
    .attr("class", "grid")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(xScale)
      .ticks(5)
      .tickSize(-height)
      .tickFormat("")
    );

  gridlines.selectAll("line")
    .style("stroke", "#f7fafc")
    .style("stroke-width", 1);

  gridlines.select(".domain").remove();

  // Add summary text
  const totalResponses = d3.sum(challengeData, d => d.count);
  const totalOrgs = Math.max(...Object.values(data.challengeCounts));
  
  container.append("div")
    .style("margin-top", "15px")
    .style("text-align", "center")
    .style("font-size", "12px")
    .style("color", "#718096")
    .html(`
      <strong>Top Challenge:</strong> ${challengeData[0].fullChallenge} (${challengeData[0].count} organizations)<br/>
      <strong>Total Challenge Responses:</strong> ${totalResponses} from ${Object.keys(data.challengesBySector || {}).length || 'multiple'} sectors
    `);

  // Cleanup function
  return () => {
    tooltip.remove();
  };
}
