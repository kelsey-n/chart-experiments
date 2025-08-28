import React, { useEffect, useMemo, useState } from "react";
import * as d3 from "d3";
import type { TreeNode, RawNode } from "./transform";

type Props = {
  /** One-level tree: a root whose children are the tiles to render. */
  data: TreeNode;
  width?: number;
  height?: number;
  measuredWidth?: number;
  measuredHeight?: number;
  formatValue?: (n: number) => string;
  colorAccessor?: (d: d3.HierarchyRectangularNode<TreeNode>) => string;
  /** Called after the zoom-in animation completes (to drill into this branch). */
  onDrillDown?: (raw: RawNode) => void;
  /** Called when user clicks the background (to go back up). */
  onZoomOut?: () => void;
  /** Disable drill when at the deepest level. */
  drillEnabled?: boolean;
};

const DEFAULT_WIDTH = 900;
const DEFAULT_HEIGHT = 600;

function wrapLines(
  text: string,
  w: number,
  fontPx = 12,
  maxLines = 3
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  const approxCharW = fontPx * 0.6;
  const maxChars = Math.max(1, Math.floor((w - 10) / approxCharW));
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (test.length <= maxChars) line = test;
    else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (
    lines.length === maxLines &&
    words.join(" ").length > lines.join(" ").length
  ) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\.*$/, "") + "…";
  }
  return lines;
}

export default function ZoomableTreemap({
  data,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  measuredWidth,
  measuredHeight,
  formatValue = d3.format(","),
  colorAccessor,
  onDrillDown,
  onZoomOut,
  drillEnabled = true,
}: Props) {
  const W = measuredWidth ?? width;
  const H = measuredHeight ?? height;

  // Build a rectangular hierarchy from the provided one-level data
  const root = useMemo<d3.HierarchyRectangularNode<TreeNode>>(() => {
    const h = d3
      .hierarchy<TreeNode>(data)
      .sum((d) => d.value ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    const layout = d3
      .treemap<TreeNode>()
      .tile(d3.treemapResquarify)
      .size([W, H])
      .paddingInner(1)
      .paddingTop(0);

    return layout(h);
  }, [data, W, H]);

  const nodes = root.children ?? [];

  // Colors by index (or via custom accessor)
  const color = useMemo(() => {
    if (colorAccessor) {
      return (d: d3.HierarchyRectangularNode<TreeNode>) => colorAccessor(d);
    }
    const scale = d3
      .scaleOrdinal<number, string>()
      .range([...d3.schemeTableau10]);
    return (d: d3.HierarchyRectangularNode<TreeNode>, i?: number) =>
      scale((i ?? 0) % 10);
  }, [colorAccessor]);

  // --- View-transform zoom (Observable feel) --------------------------------
  // view = [cx, cy, w] in treemap coords; default fits the full canvas
  const [view, setView] = useState<[number, number, number]>([
    W / 2,
    H / 2,
    Math.max(W, H),
  ]);

  // Reset view on size change
  useEffect(() => {
    setView([W / 2, H / 2, Math.max(W, H)]);
  }, [W, H]);

  // Also reset (animate) whenever the data changes (e.g., after drill)
  useEffect(() => {
    const target: [number, number, number] = [W / 2, H / 2, Math.max(W, H)];
    const i = d3.interpolateZoom(view, target);
    const t0 = performance.now();
    const dur = 550;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      setView(i(t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]); // intentionally only on data identity

  const zoomToRect = (
    rect: { x0: number; y0: number; x1: number; y1: number },
    dur = 550,
    onEnd?: () => void
  ) => {
    const target: [number, number, number] = [
      (rect.x0 + rect.x1) / 2,
      (rect.y0 + rect.y1) / 2,
      Math.max(rect.x1 - rect.x0, rect.y1 - rect.y0),
    ];
    const i = d3.interpolateZoom(view, target);
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      setView(i(t));
      if (t < 1) raf = requestAnimationFrame(tick);
      else onEnd?.();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  };

  // Compose the transform matrix
  const [cx, cy, vw] = view;
  const k = W / vw;
  const viewTransform = `translate(${W / 2},${
    H / 2
  }) scale(${k}) translate(${-cx},${-cy})`;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <svg width={W} height={H} style={{ display: "block" }}>
        {/* Background: click to go up */}
        <rect
          x={0}
          y={0}
          width={W}
          height={H}
          fill="white"
          onClick={() => {
            onZoomOut?.();
          }}
        />
        <g transform={viewTransform}>
          {nodes.map((d, i) => {
            const w = d.x1 - d.x0;
            const h = d.y1 - d.y0;
            const lines = wrapLines(d.data.name, w, 12, 3);
            const valOk = typeof d.value === "number" && (d.value ?? 0) > 0;

            return (
              <g
                key={`${d.data.name}-${i}-${d.x0}-${d.y0}`}
                transform={`translate(${d.x0},${d.y0})`}
                style={{
                  cursor: drillEnabled ? "pointer" : "default",
                  transition: "opacity 200ms ease",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!drillEnabled || !d.data.__raw) return;
                  // 1) Zoom the clicked rect to fill
                  zoomToRect(d, 600, () => {
                    // 2) Ask container to drill into this branch (it will update data)
                    onDrillDown?.(d.data.__raw!);
                  });
                }}
              >
                <rect
                  width={w}
                  height={h}
                  fill={color(d, i)}
                  opacity={0.9}
                  stroke="white"
                  strokeWidth={1}
                  rx={3}
                  ry={3}
                />
                {/* Labels */}
                {h > 18 && (
                  <>
                    {lines.map((ln, li) => (
                      <text
                        key={li}
                        x={6}
                        y={14 + li * 14}
                        fontSize={12}
                        fontWeight={600}
                        fill="white"
                        pointerEvents="none"
                        style={{ textShadow: "0 1px 1px rgba(0,0,0,0.35)" }}
                      >
                        {ln}
                      </text>
                    ))}
                    {valOk && h > 32 && (
                      <text
                        x={6}
                        y={14 + lines.length * 14 + 12}
                        fontSize={11}
                        fill="white"
                        opacity={0.9}
                        pointerEvents="none"
                      >
                        {formatValue(d.value as number)}
                      </text>
                    )}
                  </>
                )}
                <title>
                  {d.data.name}
                  {d.data.desc ? ` — ${d.data.desc}` : ""}
                  {valOk ? `\n${formatValue(d.value as number)}` : ""}
                </title>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

// import React, { useMemo, useState, useCallback } from "react";
// import * as d3 from "d3";

// // Your TreeNode from the transformer
// type TreeNode = {
//   name: string;
//   desc?: string;
//   level: 0 | 1 | 2;
//   value?: number;
//   children?: TreeNode[];
// };

// type Props = {
//   data: TreeNode;
//   width?: number;
//   height?: number;
//   measuredWidth?: number;
//   measuredHeight?: number;
//   formatValue?: (n: number) => string;
//   colorAccessor?: (d: d3.HierarchyRectangularNode<TreeNode>) => string;
// };

// const DEFAULT_WIDTH = 900;
// const DEFAULT_HEIGHT = 600;

// function fitLabel(label: string, w: number, charW = 7) {
//   const maxChars = Math.max(1, Math.floor((w - 10) / charW));
//   if (label.length <= maxChars) return label;
//   if (maxChars <= 3) return label.slice(0, Math.max(0, maxChars));
//   return label.slice(0, maxChars - 1) + "…";
// }

// export default function ZoomableTreemap({
//   data,
//   width = DEFAULT_WIDTH,
//   height = DEFAULT_HEIGHT,
//   measuredWidth,
//   measuredHeight,
//   formatValue = d3.format(","),
//   colorAccessor,
// }: Props) {
//   const W = measuredWidth ?? width;
//   const H = measuredHeight ?? height;

//   // ✅ Capture the return from the treemap layout:
//   const root = useMemo<d3.HierarchyRectangularNode<TreeNode>>(() => {
//     const hierarchy = d3
//       .hierarchy<TreeNode>(data)
//       .sum((d) => d.value ?? 0)
//       .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

//     const layout = d3
//       .treemap<TreeNode>()
//       .tile(d3.treemapResquarify)
//       .size([W, H])
//       .paddingInner(1)
//       .paddingTop((d) => (d.depth === 0 ? 0 : 20));

//     return layout(hierarchy); // <-- typed as HierarchyRectangularNode
//   }, [data, W, H]);

//   // ✅ Everything downstream keeps the rectangular type:
//   const [focus, setFocus] =
//     useState<d3.HierarchyRectangularNode<TreeNode>>(root);

//   const color = useMemo(() => {
//     if (colorAccessor)
//       return (d: d3.HierarchyRectangularNode<TreeNode>) => colorAccessor(d);
//     const parents = root.children?.map((d) => d.data.name) ?? [];
//     const scale = d3
//       .scaleOrdinal<string, string>()
//       .domain(parents)
//       .range([...d3.schemeTableau10]); // spread to avoid readonly→mutable issues

//     const top1 = (d: d3.HierarchyRectangularNode<TreeNode>) =>
//       d.ancestors().find((a) => a.depth === 1)?.data.name ?? d.data.name;

//     return (d: d3.HierarchyRectangularNode<TreeNode>) => scale(top1(d));
//   }, [root, colorAccessor]);

//   const viewCoords = useCallback(
//     (node: d3.HierarchyRectangularNode<TreeNode>) => {
//       const kx = W / (focus.x1 - focus.x0 || 1);
//       const ky = H / (focus.y1 - focus.y0 || 1);
//       const ox = -focus.x0;
//       const oy = -focus.y0;
//       const x0 = (node.x0 + ox) * kx;
//       const x1 = (node.x1 + ox) * kx;
//       const y0 = (node.y0 + oy) * ky;
//       const y1 = (node.y1 + oy) * ky;
//       return { x0, y0, w: x1 - x0, h: y1 - y0 };
//     },
//     [focus, W, H]
//   );

//   const handleZoom = useCallback(
//     (n?: d3.HierarchyRectangularNode<TreeNode>) => {
//       if (n) setFocus(n);
//     },
//     []
//   );

//   // ✅ descendants() are rectangular nodes too
//   const nodes = root.descendants();
//   const isLeaf = (d: d3.HierarchyRectangularNode<TreeNode>) =>
//     !d.children || d.children.length === 0;
//   const breadcrumb = focus.ancestors().reverse();

//   return (
//     <div style={{ position: "relative", width: "100%", height: "100%" }}>
//       <div
//         style={{
//           position: "absolute",
//           top: 8,
//           left: 12,
//           zIndex: 2,
//           fontSize: 12,
//         }}
//       >
//         {breadcrumb.map((n, i) => {
//           const isLast = i === breadcrumb.length - 1;
//           return (
//             <span key={i}>
//               <button
//                 onClick={() => handleZoom(n)}
//                 disabled={isLast}
//                 style={{
//                   border: "none",
//                   background: "none",
//                   cursor: isLast ? "default" : "pointer",
//                   fontWeight: isLast ? 700 : 500,
//                   opacity: isLast ? 1 : 0.8,
//                   padding: 0,
//                 }}
//                 title={n.data.desc || n.data.name}
//               >
//                 {n.data.name}
//               </button>
//               {i < breadcrumb.length - 1 && <span> › </span>}
//             </span>
//           );
//         })}
//       </div>

//       <svg width={W} height={H} style={{ display: "block" }}>
//         <rect
//           x={0}
//           y={0}
//           width={W}
//           height={H}
//           fill="white"
//           onClick={() => handleZoom(focus.parent ?? root)}
//         />
//         <g>
//           {nodes.map((d) => {
//             const isDesc = focus === d || d.ancestors().includes(focus);
//             if (!isDesc) return null;

//             const { x0, y0, w, h } = viewCoords(d);
//             const showText = w > 70 && h > 24;

//             return (
//               <g
//                 key={`${d.depth}-${d.data.name}-${d.x0}-${d.y0}`}
//                 transform={`translate(${x0},${y0})`}
//                 onClick={(e) => {
//                   e.stopPropagation();
//                   if (d.children) handleZoom(d);
//                 }}
//                 style={{
//                   cursor: d.children ? "pointer" : "default",
//                   transition: "transform 250ms ease, opacity 250ms ease",
//                 }}
//               >
//                 <rect
//                   width={w}
//                   height={h}
//                   fill={color(d)}
//                   opacity={isLeaf(d) ? 0.92 : 0.75}
//                   stroke="white"
//                   strokeWidth={1}
//                   rx={3}
//                   ry={3}
//                 />
//                 {showText && (
//                   <>
//                     <text
//                       x={6}
//                       y={16}
//                       fontSize={12}
//                       fontWeight={600}
//                       fill="white"
//                       pointerEvents="none"
//                       style={{ textShadow: "0 1px 1px rgba(0,0,0,0.35)" }}
//                     >
//                       {fitLabel(d.data.name, w)}
//                     </text>
//                     {typeof d.value === "number" && d.value > 0 && (
//                       <text
//                         x={6}
//                         y={32}
//                         fontSize={11}
//                         fill="white"
//                         opacity={0.9}
//                         pointerEvents="none"
//                       >
//                         {formatValue(d.value)}
//                       </text>
//                     )}
//                   </>
//                 )}
//                 <title>
//                   {d.data.name}
//                   {d.data.desc ? ` — ${d.data.desc}` : ""}
//                   {typeof d.value === "number"
//                     ? `\n${formatValue(d.value)}`
//                     : ""}
//                 </title>
//               </g>
//             );
//           })}
//         </g>
//       </svg>
//     </div>
//   );
// }
