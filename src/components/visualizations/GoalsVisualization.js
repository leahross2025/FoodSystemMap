// Goals Visualization using D3.js Donut Chart
export function createGoalsVisualization(selector, data) {
  // Clear any existing content
  d3.select(selector).selectAll("*").remove();

  const container = d3.select(selector);
  const containerRect = container.node().getBoundingClientRect();
  
  // Set dimensions
  const width = Math.min(containerRect.width, 400);
  const height = 350;
  const radius = Math.min(width, height) / 2 - 20;

  // Create SVG
  const svg = container
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .style("display", "block")
    .style("margin", "0 auto");

  const g = svg.append("g")
    .attr("transform", `translate(${width / 2},${height / 2})`);

  // Color scale
  const color = d3.scaleOrdinal()
    .domain(data.children.map(d => d.name))
    .range(['#38a169', '#3182ce', '#805ad5', '#dd6b20', '#e53e3e']);

  // Create pie layout
  const pie = d3.pie()
    .value(d => d.value)
    .sort(null);

  // Create arc generator
  const arc = d3.arc()
    .innerRadius(radius * 0.5)
    .outerRadius(radius);

  const outerArc = d3.arc()
    .innerRadius(radius * 1.1)
    .outerRadius(radius * 1.1);

  // Create tooltip
  const tooltip = d3.select("body").append("div")
    .attr("class", "goals-tooltip")
    .style("opacity", 0)
    .style("position", "absolute")
    .style("background", "rgba(0, 0, 0, 0.8)")
    .style("color", "white")
    .style("padding", "10px")
    .style("border-radius", "5px")
    .style("font-size", "12px")
    .style("pointer-events", "none")
    .style("z-index", "1000");

  // Create arcs
  const arcs = g.selectAll(".arc")
    .data(pie(data.children))
    .enter().append("g")
    .attr("class", "arc");

  // Add paths
  arcs.append("path")
    .attr("d", arc)
    .attr("fill", d => color(d.data.name))
    .attr("stroke", "white")
    .attr("stroke-width", 2)
    .style("cursor", "pointer")
    .on("mouseover", function(event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr("d", d3.arc()
          .innerRadius(radius * 0.5)
          .outerRadius(radius + 10)
        );

      tooltip.transition()
        .duration(200)
        .style("opacity", .9);
      
      const percentage = ((d.data.value / d3.sum(data.children, d => d.value)) * 100).toFixed(1);
      
      tooltip.html(`
        <strong>${d.data.fullName || d.data.name}</strong><br/>
        Organizations: ${d.data.value}<br/>
        Percentage: ${percentage}%
      `)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");
    })
    .on("mouseout", function(event, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr("d", arc);

      tooltip.transition()
        .duration(500)
        .style("opacity", 0);
    });

  // Add percentage labels
  arcs.append("text")
    .attr("transform", d => {
      const centroid = arc.centroid(d);
      return `translate(${centroid})`;
    })
    .attr("dy", ".35em")
    .style("text-anchor", "middle")
    .style("font-size", "12px")
    .style("font-weight", "bold")
    .style("fill", "white")
    .text(d => {
      const percentage = ((d.data.value / d3.sum(data.children, d => d.value)) * 100);
      return percentage > 5 ? `${percentage.toFixed(0)}%` : '';
    });

  // Add polylines and labels for smaller segments
  const polylines = g.selectAll(".polyline")
    .data(pie(data.children))
    .enter().append("polyline")
    .attr("class", "polyline")
    .attr("stroke", "#666")
    .attr("stroke-width", 1)
    .attr("fill", "none")
    .attr("points", d => {
      const percentage = ((d.data.value / d3.sum(data.children, d => d.value)) * 100);
      if (percentage <= 5) {
        const pos = outerArc.centroid(d);
        pos[0] = radius * 0.95 * (midAngle(d) < Math.PI ? 1 : -1);
        return [arc.centroid(d), outerArc.centroid(d), pos];
      }
      return null;
    })
    .style("opacity", d => {
      const percentage = ((d.data.value / d3.sum(data.children, d => d.value)) * 100);
      return percentage <= 5 ? 1 : 0;
    });

  const labels = g.selectAll(".label")
    .data(pie(data.children))
    .enter().append("text")
    .attr("class", "label")
    .attr("dy", ".35em")
    .style("font-size", "11px")
    .style("fill", "#2d3748")
    .attr("transform", d => {
      const percentage = ((d.data.value / d3.sum(data.children, d => d.value)) * 100);
      if (percentage <= 5) {
        const pos = outerArc.centroid(d);
        pos[0] = radius * 0.95 * (midAngle(d) < Math.PI ? 1 : -1);
        return `translate(${pos})`;
      }
      return null;
    })
    .style("text-anchor", d => midAngle(d) < Math.PI ? "start" : "end")
    .text(d => {
      const percentage = ((d.data.value / d3.sum(data.children, d => d.value)) * 100);
      return percentage <= 5 ? `${d.data.name} (${d.data.value})` : '';
    })
    .style("opacity", d => {
      const percentage = ((d.data.value / d3.sum(data.children, d => d.value)) * 100);
      return percentage <= 5 ? 1 : 0;
    });

  // Helper function to calculate mid angle
  function midAngle(d) {
    return d.startAngle + (d.endAngle - d.startAngle) / 2;
  }

  // Add center text
  g.append("text")
    .attr("text-anchor", "middle")
    .attr("dy", "-0.5em")
    .style("font-size", "14px")
    .style("font-weight", "bold")
    .style("fill", "#2d3748")
    .text("Primary Goals");

  g.append("text")
    .attr("text-anchor", "middle")
    .attr("dy", "1em")
    .style("font-size", "12px")
    .style("fill", "#718096")
    .text(`${d3.sum(data.children, d => d.value)} Organizations`);

  // Create legend
  const legend = container.append("div")
    .style("margin-top", "20px")
    .style("display", "flex")
    .style("flex-wrap", "wrap")
    .style("justify-content", "center")
    .style("gap", "15px");

  const legendItems = legend.selectAll(".legend-item")
    .data(data.children)
    .enter().append("div")
    .style("display", "flex")
    .style("align-items", "center")
    .style("gap", "8px")
    .style("font-size", "12px");

  legendItems.append("div")
    .style("width", "12px")
    .style("height", "12px")
    .style("border-radius", "50%")
    .style("background-color", d => color(d.name));

  legendItems.append("span")
    .text(d => `${d.name} (${d.value})`);

  // Cleanup function
  return () => {
    tooltip.remove();
  };
}
