import React, { useMemo, useState, useCallback } from "react";
import * as d3 from "d3";
import type { TreeNode } from "./transform"; // from the code above

type TreemapProps = {
  data: TreeNode; // Output of toTree(...)
  width?: number;
  height?: number;
  measuredWidth?: number; // from your useSize hook if you prefer
  measuredHeight?: number;
  formatValue?: (n: number) => string;
  // Optional color override
  colorAccessor?: (d: d3.HierarchyNode<TreeNode>) => string;
};

const DEFAULT_WIDTH = 900;
const DEFAULT_HEIGHT = 600;

function fitLabel(label: string, w: number, charW = 7): string {
  const maxChars = Math.max(1, Math.floor((w - 10) / charW));
  if (label.length <= maxChars) return label;
  if (maxChars <= 3) return label.slice(0, Math.max(0, maxChars));
  return label.slice(0, maxChars - 1) + "…";
}

export default function ZoomableTreemap({
  data,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  measuredWidth,
  measuredHeight,
  formatValue = d3.format(","),
  colorAccessor,
}: TreemapProps) {
  const W = measuredWidth ?? width;
  const H = measuredHeight ?? height;

  // Build the D3 hierarchy & layout
  const root = useMemo(() => {
    const h = d3
      .hierarchy<TreeNode>(data)
      .sum((d) => d.value ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    d3
      .treemap<TreeNode>()
      .tile(d3.treemapResquarify)
      .size([W, H])
      .paddingInner(1)
      .paddingTop((d) => (d.depth === 0 ? 0 : 20))(h);

    return h;
  }, [data, W, H]);

  // Colors: group by top-level (depth 1) cluster name
  const color = useMemo(() => {
    if (colorAccessor)
      return (d: d3.HierarchyNode<TreeNode>) => colorAccessor(d);
    const parents = root.children?.map((d) => d.data.name) ?? [];
    const scale = d3
      .scaleOrdinal<string, string>()
      .domain(parents)
      .range(d3.schemeTableau10);
    const top1 = (d: d3.HierarchyNode<TreeNode>) =>
      d.ancestors().find((a) => a.depth === 1)?.data.name ?? d.data.name;
    return (d: d3.HierarchyNode<TreeNode>) => scale(top1(d));
  }, [root, colorAccessor]);

  const [focus, setFocus] = useState<d3.HierarchyNode<TreeNode>>(root);
  const viewCoords = useCallback(
    (node: d3.HierarchyRectangularNode<TreeNode>) => {
      const kx = W / (focus.x1 - focus.x0 || 1);
      const ky = H / (focus.y1 - focus.y0 || 1);
      const ox = -focus.x0;
      const oy = -focus.y0;
      const x0 = (node.x0 + ox) * kx;
      const x1 = (node.x1 + ox) * kx;
      const y0 = (node.y0 + oy) * ky;
      const y1 = (node.y1 + oy) * ky;
      return { x0, y0, w: x1 - x0, h: y1 - y0 };
    },
    [focus, W, H]
  );

  const handleZoom = useCallback((n?: d3.HierarchyNode<TreeNode>) => {
    if (n) setFocus(n);
  }, []);

  const nodes = root.descendants();
  const isLeaf = (d: d3.HierarchyNode<TreeNode>) =>
    !d.children || d.children.length === 0;
  const breadcrumb = focus.ancestors().reverse();

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Breadcrumbs */}
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 12,
          zIndex: 2,
          fontSize: 12,
        }}
      >
        {breadcrumb.map((n, i) => {
          const isLast = i === breadcrumb.length - 1;
          return (
            <span key={i}>
              <button
                onClick={() => handleZoom(n)}
                disabled={isLast}
                style={{
                  border: "none",
                  background: "none",
                  cursor: isLast ? "default" : "pointer",
                  fontWeight: isLast ? 700 : 500,
                  opacity: isLast ? 1 : 0.8,
                  padding: 0,
                }}
                title={n.data.desc || n.data.name}
              >
                {n.data.name}
              </button>
              {i < breadcrumb.length - 1 && <span> › </span>}
            </span>
          );
        })}
      </div>

      <svg width={W} height={H} style={{ display: "block" }}>
        <rect
          x={0}
          y={0}
          width={W}
          height={H}
          fill="white"
          onClick={() => handleZoom(focus.parent ?? root)}
        />
        <g>
          {nodes.map((d) => {
            // Only draw nodes inside the current focus branch
            const isDesc = focus === d || d.ancestors().includes(focus);
            if (!isDesc) return null;

            const { x0, y0, w, h } = viewCoords(
              d as d3.HierarchyRectangularNode<TreeNode>
            );
            const showText = w > 70 && h > 24;

            return (
              <g
                key={`${d.depth}-${d.data.name}-${d.x0}-${d.y0}`}
                transform={`translate(${x0},${y0})`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (d.children) handleZoom(d);
                }}
                style={{
                  cursor: d.children ? "pointer" : "default",
                  transition: "transform 250ms ease, opacity 250ms ease",
                }}
              >
                <rect
                  width={w}
                  height={h}
                  fill={color(d)}
                  opacity={isLeaf(d) ? 0.92 : 0.75}
                  stroke="white"
                  strokeWidth={1}
                  rx={3}
                  ry={3}
                />
                {showText && (
                  <>
                    <text
                      x={6}
                      y={16}
                      fontSize={12}
                      fontWeight={600}
                      fill="white"
                      pointerEvents="none"
                      style={{ textShadow: "0 1px 1px rgba(0,0,0,0.35)" }}
                    >
                      {fitLabel(d.data.name, w)}
                    </text>
                    {typeof d.value === "number" && d.value > 0 && (
                      <text
                        x={6}
                        y={32}
                        fontSize={11}
                        fill="white"
                        opacity={0.9}
                        pointerEvents="none"
                      >
                        {formatValue(d.value)}
                      </text>
                    )}
                  </>
                )}
                {/* Optional: tooltip title */}
                <title>
                  {d.data.name}
                  {d.data.desc ? ` — ${d.data.desc}` : ""}
                  {typeof d.value === "number"
                    ? `\n${formatValue(d.value)}`
                    : ""}
                </title>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
