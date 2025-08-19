// Geographic Flow Visualization using D3.js Sankey-style Diagram
export function createGeographicVisualization(selector, data) {
  // Clear any existing content
  d3.select(selector).selectAll("*").remove();

  const container = d3.select(selector);
  const containerRect = container.node().getBoundingClientRect();
  
  // Set dimensions
  const margin = { top: 40, right: 40, bottom: 40, left: 40 };
  const width = containerRect.width - margin.left - margin.right;
  const height = 400 - margin.top - margin.bottom;

  // Create SVG
  const svg = container
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom);

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // Process data to create nodes and links
  const districts = ['District 1', 'District 2', 'District 3', 'District 4', 'District 5', 'Countywide'];
  const nodes = [];
  const links = [];

  // Create source nodes (left side)
  districts.forEach((district, i) => {
    nodes.push({
      id: `source-${district}`,
      name: district,
      type: 'source',
      x: 0,
      y: (height / (districts.length - 1)) * i,
      value: 0
    });
  });

  // Create target nodes (right side)
  districts.forEach((district, i) => {
    nodes.push({
      id: `target-${district}`,
      name: district,
      type: 'target',
      x: width,
      y: (height / (districts.length - 1)) * i,
      value: 0
    });
  });

  // Process flow data
  if (data && data.length > 0) {
    data.forEach(flow => {
      const sourceNode = nodes.find(n => n.name === flow.source && n.type === 'source');
      const targetNode = nodes.find(n => n.name === flow.target && n.type === 'target');
      
      if (sourceNode && targetNode) {
        sourceNode.value += flow.value;
        targetNode.value += flow.value;
        
        links.push({
          source: sourceNode,
          target: targetNode,
          value: flow.value,
          organizations: flow.organizations || []
        });
      }
    });
  }

  // Filter out nodes with no connections
  const activeNodes = nodes.filter(n => n.value > 0);
  const activeLinks = links.filter(l => l.value > 0);

  // Color scale
  const colorScale = d3.scaleOrdinal()
    .domain(districts)
    .range(['#E53E3E', '#3182CE', '#38A169', '#805AD5', '#DD6B20', '#4A5568']);

  // Create tooltip
  const tooltip = d3.select("body").append("div")
    .attr("class", "geographic-tooltip")
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

  if (activeLinks.length === 0) {
    // Show message when no cross-district flows exist
    g.append("text")
      .attr("x", width / 2)
      .attr("y", height / 2)
      .attr("text-anchor", "middle")
      .style("font-size", "16px")
      .style("fill", "#718096")
      .text("No cross-district service flows detected");

    g.append("text")
      .attr("x", width / 2)
      .attr("y", height / 2 + 25)
      .attr("text-anchor", "middle")
      .style("font-size", "12px")
      .style("fill", "#718096")
      .text("Most organizations serve within their home district or countywide");

    return () => {};
  }

  // Create curved paths for links
  const linkPath = d3.linkHorizontal()
    .x(d => d.x)
    .y(d => d.y);

  // Draw links
  const linkElements = g.selectAll(".link")
    .data(activeLinks)
    .enter().append("path")
    .attr("class", "link")
    .attr("d", linkPath)
    .attr("fill", "none")
    .attr("stroke", d => colorScale(d.source.name))
    .attr("stroke-width", d => Math.max(2, d.value * 3))
    .attr("stroke-opacity", 0.6)
    .style("cursor", "pointer");

  // Add hover interactions to links
  linkElements
    .on("mouseover", function(event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr("stroke-opacity", 0.9)
        .attr("stroke-width", Math.max(4, d.value * 4));

      tooltip.transition()
        .duration(200)
        .style("opacity", .9);
      
      const orgList = d.organizations.length > 0 ? 
        "<br/><br/><strong>Organizations:</strong><br/>" + 
        d.organizations.slice(0, 5).join("<br/>") +
        (d.organizations.length > 5 ? `<br/>...and ${d.organizations.length - 5} more` : "")
        : "";
      
      tooltip.html(`
        <strong>Service Flow</strong><br/>
        From: ${d.source.name}<br/>
        To: ${d.target.name}<br/>
        Organizations: ${d.value}${orgList}
      `)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");
    })
    .on("mouseout", function(event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr("stroke-opacity", 0.6)
        .attr("stroke-width", Math.max(2, d.value * 3));

      tooltip.transition()
        .duration(500)
        .style("opacity", 0);
    });

  // Draw nodes
  const nodeElements = g.selectAll(".node")
    .data(activeNodes)
    .enter().append("circle")
    .attr("class", "node")
    .attr("cx", d => d.x)
    .attr("cy", d => d.y)
    .attr("r", d => Math.max(8, Math.sqrt(d.value) * 4))
    .attr("fill", d => colorScale(d.name))
    .attr("stroke", "white")
    .attr("stroke-width", 2)
    .style("cursor", "pointer");

  // Add hover interactions to nodes
  nodeElements
    .on("mouseover", function(event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr("r", Math.max(10, Math.sqrt(d.value) * 5));

      // Highlight connected links
      linkElements
        .transition()
        .duration(200)
        .attr("stroke-opacity", l => 
          (l.source.id === d.id || l.target.id === d.id) ? 0.9 : 0.2
        );

      tooltip.transition()
        .duration(200)
        .style("opacity", .9);
      
      const flowType = d.type === 'source' ? 'Organizations based here' : 'Organizations serving here';
      
      tooltip.html(`
        <strong>${d.name}</strong><br/>
        ${flowType}: ${d.value}<br/>
        Type: ${d.type === 'source' ? 'Headquarters' : 'Service Area'}
      `)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");
    })
    .on("mouseout", function(event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr("r", Math.max(8, Math.sqrt(d.value) * 4));

      // Reset link opacity
      linkElements
        .transition()
        .duration(200)
        .attr("stroke-opacity", 0.6);

      tooltip.transition()
        .duration(500)
        .style("opacity", 0);
    });

  // Add node labels
  g.selectAll(".node-label")
    .data(activeNodes)
    .enter().append("text")
    .attr("class", "node-label")
    .attr("x", d => d.type === 'source' ? d.x - 15 : d.x + 15)
    .attr("y", d => d.y)
    .attr("dy", ".35em")
    .style("text-anchor", d => d.type === 'source' ? "end" : "start")
    .style("font-size", "11px")
    .style("font-weight", "bold")
    .style("fill", "#2d3748")
    .text(d => d.name);

  // Add section labels
  g.append("text")
    .attr("x", 0)
    .attr("y", -20)
    .style("text-anchor", "middle")
    .style("font-size", "14px")
    .style("font-weight", "bold")
    .style("fill", "#4a5568")
    .text("Headquarters");

  g.append("text")
    .attr("x", width)
    .attr("y", -20)
    .style("text-anchor", "middle")
    .style("font-size", "14px")
    .style("font-weight", "bold")
    .style("fill", "#4a5568")
    .text("Service Areas");

  // Add summary statistics
  const totalFlows = d3.sum(activeLinks, d => d.value);
  const crossDistrictOrgs = new Set();
  activeLinks.forEach(link => {
    link.organizations.forEach(org => crossDistrictOrgs.add(org));
  });

  container.append("div")
    .style("margin-top", "20px")
    .style("text-align", "center")
    .style("font-size", "12px")
    .style("color", "#718096")
    .html(`
      <div style="display: flex; justify-content: space-around; flex-wrap: wrap; gap: 20px;">
        <div>
          <strong>Cross-District Flows:</strong> ${totalFlows}
        </div>
        <div>
          <strong>Organizations Serving Multiple Districts:</strong> ${crossDistrictOrgs.size}
        </div>
        <div>
          <strong>Most Active Flow:</strong> ${activeLinks.length > 0 ? 
            `${activeLinks.reduce((max, link) => link.value > max.value ? link : max).source.name} → ${activeLinks.reduce((max, link) => link.value > max.value ? link : max).target.name}` 
            : 'None'}
        </div>
      </div>
    `);

  // Create legend
  const legend = svg.append("g")
    .attr("class", "legend")
    .attr("transform", `translate(20, 20)`);

  legend.append("text")
    .attr("x", 0)
    .attr("y", 0)
    .text("Districts")
    .style("font-weight", "bold")
    .style("font-size", "12px")
    .style("fill", "#2d3748");

  const legendItems = legend.selectAll(".legend-item")
    .data(districts)
    .enter().append("g")
    .attr("class", "legend-item")
    .attr("transform", (d, i) => `translate(0, ${20 + i * 18})`);

  legendItems.append("circle")
    .attr("r", 6)
    .attr("fill", d => colorScale(d));

  legendItems.append("text")
    .attr("x", 12)
    .attr("y", 0)
    .attr("dy", ".35em")
    .style("font-size", "11px")
    .style("fill", "#4a5568")
    .text(d => d);

  // Cleanup function
  return () => {
    tooltip.remove();
  };
}
