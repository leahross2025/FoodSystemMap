// Network Visualization using D3.js Force-Directed Graph
export function createNetworkVisualization(selector, data) {
  // Clear any existing content
  d3.select(selector).selectAll("*").remove();

  const container = d3.select(selector);
  const containerRect = container.node().getBoundingClientRect();
  
  // Set dimensions
  const margin = { top: 20, right: 20, bottom: 20, left: 20 };
  const width = containerRect.width - margin.left - margin.right;
  const height = 500 - margin.top - margin.bottom;

  // Create SVG
  const svg = container
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

  const scopeColors = {
    'Countywide': '#e53e3e',
    'Multi-District': '#d69e2e',
    'Single District': '#38a169'
  };

  // Create tooltip
  const tooltip = d3.select("body").append("div")
    .attr("class", "network-tooltip")
    .style("opacity", 0)
    .style("position", "absolute")
    .style("background", "rgba(0, 0, 0, 0.8)")
    .style("color", "white")
    .style("padding", "10px")
    .style("border-radius", "5px")
    .style("font-size", "12px")
    .style("pointer-events", "none")
    .style("z-index", "1000");

  // Create force simulation
  const simulation = d3.forceSimulation(data.nodes)
    .force("link", d3.forceLink(data.links).id(d => d.id).distance(d => 100 - d.strength * 10))
    .force("charge", d3.forceManyBody().strength(-300))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide().radius(d => d.size + 2));

  // Create links
  const link = g.append("g")
    .attr("class", "links")
    .selectAll("line")
    .data(data.links)
    .enter().append("line")
    .attr("stroke", "#999")
    .attr("stroke-opacity", 0.6)
    .attr("stroke-width", d => Math.sqrt(d.strength));

  // Create nodes
  const node = g.append("g")
    .attr("class", "nodes")
    .selectAll("circle")
    .data(data.nodes)
    .enter().append("circle")
    .attr("r", d => d.size)
    .attr("fill", d => sectorColors[d.sector] || sectorColors['Unknown'])
    .attr("stroke", d => scopeColors[d.scope] || scopeColors['Single District'])
    .attr("stroke-width", 2)
    .style("cursor", "pointer")
    .call(d3.drag()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended));

  // Add labels for larger nodes
  const labels = g.append("g")
    .attr("class", "labels")
    .selectAll("text")
    .data(data.nodes.filter(d => d.size > 10))
    .enter().append("text")
    .text(d => d.name.length > 20 ? d.name.substring(0, 20) + "..." : d.name)
    .attr("font-size", "10px")
    .attr("font-family", "Arial, sans-serif")
    .attr("text-anchor", "middle")
    .attr("dy", ".35em")
    .style("pointer-events", "none")
    .style("fill", "#2d3748");

  // Add hover interactions
  node
    .on("mouseover", function(event, d) {
      // Highlight connected nodes
      const connectedNodes = new Set();
      connectedNodes.add(d.id);
      
      data.links.forEach(link => {
        if (link.source.id === d.id) connectedNodes.add(link.target.id);
        if (link.target.id === d.id) connectedNodes.add(link.source.id);
      });

      node.style("opacity", n => connectedNodes.has(n.id) ? 1 : 0.3);
      link.style("opacity", l => l.source.id === d.id || l.target.id === d.id ? 1 : 0.1);

      // Show tooltip
      tooltip.transition()
        .duration(200)
        .style("opacity", .9);
      
      tooltip.html(`
        <strong>${d.name}</strong><br/>
        Sector: ${d.sector}<br/>
        District: ${d.district}<br/>
        Scope: ${d.scope}<br/>
        Primary Goal: ${d.primaryGoal ? d.primaryGoal.substring(0, 50) + "..." : "Not specified"}
      `)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");
    })
    .on("mouseout", function(event, d) {
      // Reset opacity
      node.style("opacity", 1);
      link.style("opacity", 0.6);
      
      // Hide tooltip
      tooltip.transition()
        .duration(500)
        .style("opacity", 0);
    });

  // Update positions on simulation tick
  simulation.on("tick", () => {
    link
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

    node
      .attr("cx", d => d.x)
      .attr("cy", d => d.y);

    labels
      .attr("x", d => d.x)
      .attr("y", d => d.y);
  });

  // Drag functions
  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

  // Create legend
  const legend = svg.append("g")
    .attr("class", "legend")
    .attr("transform", `translate(${width - 150}, 30)`);

  // Sector legend
  legend.append("text")
    .attr("x", 0)
    .attr("y", 0)
    .text("Sector")
    .style("font-weight", "bold")
    .style("font-size", "12px");

  const sectorLegend = legend.selectAll(".sector-legend")
    .data(Object.entries(sectorColors))
    .enter().append("g")
    .attr("class", "sector-legend")
    .attr("transform", (d, i) => `translate(0, ${20 + i * 20})`);

  sectorLegend.append("circle")
    .attr("r", 6)
    .attr("fill", d => d[1]);

  sectorLegend.append("text")
    .attr("x", 12)
    .attr("y", 0)
    .attr("dy", ".35em")
    .style("font-size", "11px")
    .text(d => d[0]);

  // Scope legend
  legend.append("text")
    .attr("x", 0)
    .attr("y", 140)
    .text("Scope (border)")
    .style("font-weight", "bold")
    .style("font-size", "12px");

  const scopeLegend = legend.selectAll(".scope-legend")
    .data(Object.entries(scopeColors))
    .enter().append("g")
    .attr("class", "scope-legend")
    .attr("transform", (d, i) => `translate(0, ${160 + i * 20})`);

  scopeLegend.append("circle")
    .attr("r", 6)
    .attr("fill", "white")
    .attr("stroke", d => d[1])
    .attr("stroke-width", 2);

  scopeLegend.append("text")
    .attr("x", 12)
    .attr("y", 0)
    .attr("dy", ".35em")
    .style("font-size", "11px")
    .text(d => d[0]);

  // Add controls
  const controls = container.append("div")
    .style("margin-top", "10px")
    .style("text-align", "center");

  controls.append("button")
    .text("Reset Positions")
    .style("padding", "8px 16px")
    .style("margin", "0 5px")
    .style("background", "#38a169")
    .style("color", "white")
    .style("border", "none")
    .style("border-radius", "4px")
    .style("cursor", "pointer")
    .on("click", () => {
      simulation.alpha(1).restart();
    });

  controls.append("button")
    .text("Stop Animation")
    .style("padding", "8px 16px")
    .style("margin", "0 5px")
    .style("background", "#e53e3e")
    .style("color", "white")
    .style("border", "none")
    .style("border-radius", "4px")
    .style("cursor", "pointer")
    .on("click", () => {
      simulation.stop();
    });

  // Cleanup function
  return () => {
    tooltip.remove();
    simulation.stop();
  };
}
