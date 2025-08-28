import React, { useEffect, useMemo, useRef } from "react";
import * as d3 from "d3";
import type { TreeNode, RawNode } from "./transform";

type Rect = { x0: number; y0: number; x1: number; y1: number };

type Props = {
  /** One-level tree: root whose children are the current tiles. */
  data: TreeNode;
  /** Build the next level’s one-level tree from a clicked raw node (or null if none). */
  getNextLevelTree: (raw: RawNode) => TreeNode | null;
  /** Notify parent AFTER zoom-in finishes to actually switch branch/level. */
  onDrillDown: (raw: RawNode) => void;
  /** Notify parent AFTER zoom-out finishes to go up. */
  onZoomOut: () => void;
  /** Enable/disable drill. */
  drillEnabled?: boolean;

  width?: number;
  height?: number;
  measuredWidth?: number;
  measuredHeight?: number;
};

const DEFAULT_WIDTH = 900;
const DEFAULT_HEIGHT = 600;
const HEADER_H = 30; // like Observable demo

// Simple word wrap (2 lines by default)
function wrapLines(
  text: string,
  w: number,
  fontPx = 11,
  maxLines = 2
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  const approxCharW = fontPx * 0.6;
  const maxChars = Math.max(1, Math.floor((w - 8) / approxCharW));
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
    lines[maxLines - 1] = lines[maxLines - 1] + "…";
  }
  return lines;
}

// Layout helper for a one-level TreeNode
function layoutOneLevel(data: TreeNode, W: number, H: number) {
  const h = d3
    .hierarchy<TreeNode>(data)
    .sum((d) => d.value ?? 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const treemap = d3
    .treemap<TreeNode>()
    .tile(d3.treemapResquarify)
    .size([W, H])
    .paddingInner(1)
    .paddingTop(0);
  return treemap(h) as d3.HierarchyRectangularNode<TreeNode>;
}

// Rescale the next-level layout’s child rects so they live inside a parent rect
function rescaleChildrenInto(
  nextRoot: d3.HierarchyRectangularNode<TreeNode>,
  parent: Rect,
  W: number,
  H: number
) {
  const { x0: px0, x1: px1, y0: py0, y1: py1 } = parent;
  const sx = (px1 - px0) / W;
  const sy = (py1 - py0) / H;
  return (nextRoot.children ?? []).map((c) => ({
    x0: px0 + c.x0 * sx,
    x1: px0 + c.x1 * sx,
    y0: py0 + c.y0 * sy,
    y1: py0 + c.y1 * sy,
    name: c.data.name,
    value: c.value,
  }));
}

export default function TreeMapD3({
  data,
  getNextLevelTree,
  onDrillDown,
  onZoomOut,
  drillEnabled = true,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  measuredWidth,
  measuredHeight,
}: Props) {
  const W = measuredWidth ?? width;
  const H = measuredHeight ?? height;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const stateRef = useRef({
    // x/y are the “camera” like Observable
    x: d3.scaleLinear().rangeRound([0, W]).domain([0, W]),
    y: d3.scaleLinear().rangeRound([0, H]).domain([0, H]),
    group: null as d3.Selection<SVGGElement, unknown, null, undefined> | null,
    // Stack of rects for smooth zoom-out
    stack: [] as Rect[],
  });

  const layoutRoot = useMemo(() => layoutOneLevel(data, W, H), [data, W, H]);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3
      .select(svgRef.current)
      .attr("viewBox", [0.5, -HEADER_H - 0.5, W, H + HEADER_H])
      .attr("width", W)
      .attr("height", H + HEADER_H)
      .attr("style", "max-width: 100%; height: auto;")
      .style(
        "font",
        "11px system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
      );

    // Background rect to capture clicks (zoom-out)
    svg
      .selectAll("rect.bg")
      .data([0])
      .join("rect")
      .attr("class", "bg")
      .attr("x", 0)
      .attr("y", -HEADER_H)
      .attr("width", W)
      .attr("height", H + HEADER_H)
      .attr("fill", "#fff")
      .on("click", () => zoomout());

    const { x, y } = stateRef.current;

    // (Re)render current level group
    const group0 =
      stateRef.current.group ??
      (svg.append("g").attr("pointer-events", null) as d3.Selection<
        SVGGElement,
        unknown,
        null,
        undefined
      >);

    stateRef.current.group = group0;

    render(group0, layoutRoot);

    function name(d: d3.HierarchyRectangularNode<TreeNode>) {
      return d
        .ancestors()
        .reverse()
        .map((d) => d.data.name)
        .join("/");
    }

    function render(
      group: d3.Selection<SVGGElement, unknown, null, undefined>,
      root: d3.HierarchyRectangularNode<TreeNode>
    ) {
      const nodes = root.children ? root.children.concat([root]) : [root];

      const node = group
        .selectAll<SVGGElement, any>("g.node")
        .data(nodes as any, (d: any) => d.data?.name ?? "root");

      const nodeEnter = node.join(
        (enter) =>
          enter
            .append("g")
            .attr("class", "node")
            .call((g) => {
              // click handlers (like Observable: root header or tiles)
              g.filter(
                (d: any) => (d === root ? d.parent : d.children) && drillEnabled
              )
                .attr("cursor", "pointer")
                .on("click", (_evt, d: any) =>
                  d === root ? zoomout() : zoomin(d)
                );

              g.append("title").text(
                (d: any) => `${name(d)}\n${d3.format(",")(d.value ?? 0)}`
              );

              g.append("rect")
                .attr("class", "tile")
                .attr("fill", (d: any) =>
                  d === root ? "#fff" : d.children ? "#ccc" : "#4f46e5"
                )
                .attr("stroke", "#fff");

              g.append("clipPath")
                .attr(
                  "id",
                  (_d: any, i: number) =>
                    `clip-${i}-${Math.random().toString(36).slice(2)}`
                )
                .append("use");

              const text = g
                .append("text")
                .attr("class", "label")
                .attr("font-weight", (d: any) =>
                  d === root ? ("bold" as any) : null
                )
                .attr("pointer-events", "none");

              g.each(function (d: any, i: number) {
                const sel = d3.select(this);
                const valueStr = d3.format(",")(d.value ?? 0);
                const parts = d === root ? name(d) : d.data.name;
                const lines =
                  d === root ? [parts] : wrapLines(parts, d.x1 - d.x0, 11, 2);
                const spans = [...lines, valueStr];
                const tspan = sel
                  .select<SVGTextElement>("text.label")
                  .selectAll("tspan")
                  .data(spans);
                tspan
                  .join("tspan")
                  .attr("x", 3)
                  .attr("y", (_s, j, nodes) => {
                    const isLast = j === (nodes as any[]).length - 1; // or: as ArrayLike<Element>
                    const em = (isLast ? 0.3 : 0) + 1.1 + j * 0.9;
                    return `${em}em`;
                  })
                  .attr(
                    "fill-opacity",
                    (_s, j, nodes) =>
                      (j === (nodes as any[]).length - 1 ? 0.7 : null) as any
                  )
                  .attr(
                    "font-weight",
                    (_s, j, nodes) =>
                      (j === (nodes as any[]).length - 1
                        ? "normal"
                        : null) as any
                  )

                  .text((s) => s);
              });
            }),
        (update) => update,
        (exit) => exit.remove()
      );

      position(group, root);
    }

    function position(
      group: d3.Selection<SVGGElement, unknown, null, undefined>,
      root: d3.HierarchyRectangularNode<TreeNode>
    ) {
      group
        .selectAll<any, any>("g.node")
        .attr("transform", (d: any) =>
          d === root
            ? `translate(0,${-HEADER_H})`
            : `translate(${x(d.x0)},${y(d.y0)})`
        )
        .select("rect.tile")
        .attr("width", (d: any) => (d === root ? W : x(d.x1) - x(d.x0)))
        .attr("height", (d: any) =>
          d === root ? HEADER_H : y(d.y1) - y(d.y0)
        );
    }

    function zoomin(d: d3.HierarchyRectangularNode<TreeNode>) {
      if (!drillEnabled || !d.data.__raw) return;

      const clickedRect: Rect = { x0: d.x0, y0: d.y0, x1: d.x1, y1: d.y1 };
      stateRef.current.stack.push(clickedRect);

      // Build next level layout and rescale its children into the clicked rect
      const nextTree = getNextLevelTree(d.data.__raw);
      const overlayChildren = nextTree
        ? rescaleChildrenInto(layoutOneLevel(nextTree, W, H), clickedRect, W, H)
        : [];

      const group0 = stateRef.current.group!;
      const group1 = (stateRef.current.group = svg
        .append("g")
        .attr("pointer-events", "none"));

      // Render the incoming group1 (children overlay)
      const child = group1
        .selectAll<SVGGElement, any>("g.overlay")
        .data(overlayChildren as any, (c: any) => c.name);

      const childEnter = child
        .join("g")
        .attr("class", "overlay")
        .style("opacity", 0);

      childEnter
        .append("rect")
        .attr("x", (c: any) => x(c.x0))
        .attr("y", (c: any) => y(c.y0))
        .attr("width", (c: any) => x(c.x1) - x(c.x0))
        .attr("height", (c: any) => y(c.y1) - y(c.y0))
        .attr("fill", "#000")
        .attr("opacity", 0.08);

      childEnter
        .append("text")
        .attr("x", (c: any) => x(c.x0) + 6)
        .attr("y", (c: any) => y(c.y0) + 14)
        .attr("fill", "black")
        .attr("opacity", 0.75)
        .text((c: any) => wrapLines(c.name, x(c.x1) - x(c.x0), 11, 2)[0] ?? "");

      // Update domains to zoom to the clicked rect
      stateRef.current.x.domain([d.x0, d.x1]);
      stateRef.current.y.domain([d.y0, d.y1]);

      const t = svg.transition().duration(750);

      group0.attr("pointer-events", "none");

      // Outgoing group (current level) repositions, then removes.
      t.call((tt: any) =>
        group0
          .transition(tt)
          .call(position as any, layoutRoot)
          .remove()
      );

      // Incoming overlay fades in as we zoom
      t.call((tt: any) => group1.transition(tt).style("opacity", 1)).on(
        "end",
        () => {
          // After zoom-in finishes, tell parent to actually switch branch/level
          onDrillDown(d.data.__raw!);
          // Leave group1 in place until parent re-renders us with the new data.
        }
      );
    }

    function zoomout() {
      // Pop target rect; next target is the previous rect (or full view)
      const { stack } = stateRef.current;
      if (stack.length === 0) {
        onZoomOut();
        return;
      }
      stack.pop();
      const target = stack[stack.length - 1];

      const group0 = stateRef.current.group!;
      const group1 = svg.insert("g", "*").attr("pointer-events", "none"); // new outgoing overlay

      // Render a lightweight overlay of the current tiles (so they can fade out)
      const tiles = (layoutRoot.children ?? []).map((d) => ({
        x0: d.x0,
        y0: d.y0,
        x1: d.x1,
        y1: d.y1,
        name: d.data.name,
        value: d.value,
      }));

      const ov = group1
        .selectAll("g.ov")
        .data(tiles as any, (t: any) => t.name);
      const ovEnter = ov.join("g").attr("class", "ov").style("opacity", 1);

      ovEnter
        .append("rect")
        .attr("x", (c: any) => stateRef.current.x(c.x0))
        .attr("y", (c: any) => stateRef.current.y(c.y0))
        .attr(
          "width",
          (c: any) => stateRef.current.x(c.x1) - stateRef.current.x(c.x0)
        )
        .attr(
          "height",
          (c: any) => stateRef.current.y(c.y1) - stateRef.current.y(c.y0)
        )
        .attr("fill", "#000")
        .attr("opacity", 0.08);

      // Update domains to zoom back (to previous rect or full view)
      if (target) {
        stateRef.current.x.domain([target.x0, target.x1]);
        stateRef.current.y.domain([target.y0, target.y1]);
      } else {
        stateRef.current.x.domain([0, W]);
        stateRef.current.y.domain([0, H]);
      }

      const t = svg.transition().duration(750);

      group0.attr("pointer-events", "none");

      // Fade out overlay
      t.call((tt: any) => group1.transition(tt).style("opacity", 0).remove());

      // Reposition the current level group (which parent will soon replace)
      t.call((tt: any) =>
        group0.transition(tt).call(position as any, layoutRoot)
      ).on("end", () => {
        onZoomOut();
      });
    }

    return () => {
      svg.selectAll("*").interrupt();
    };
  }, [
    layoutRoot,
    W,
    H,
    drillEnabled,
    getNextLevelTree,
    onDrillDown,
    onZoomOut,
  ]);

  return <svg ref={svgRef} />;
}

// import React, { useEffect, useMemo, useRef, useState } from "react";
// import * as d3 from "d3";
// import type { TreeNode, RawNode } from "./transform";

// type Rect = { x0: number; y0: number; x1: number; y1: number };

// type Props = {
//   /** One-level tree: a root whose children are the tiles to render. */
//   data: TreeNode;
//   width?: number;
//   height?: number;
//   measuredWidth?: number;
//   measuredHeight?: number;
//   formatValue?: (n: number) => string;
//   colorAccessor?: (
//     d: d3.HierarchyRectangularNode<TreeNode>,
//     i?: number
//   ) => string;
//   /** Called after the zoom-in finishes to actually drill the data. */
//   onDrillDown?: (raw: RawNode, clickedRect: Rect) => void;
//   /** Called after the zoom-out finishes to go back up one level. */
//   onZoomOut?: () => void;
//   /** Disable drill when at the deepest level. */
//   drillEnabled?: boolean;
//   /**
//    * Build the next level’s one-level tree (from the clicked raw node).
//    * Return null if there is no deeper level (so we won’t try to overlay).
//    */
//   getNextLevelTree?: (raw: RawNode) => TreeNode | null;
// };

// const DEFAULT_WIDTH = 900;
// const DEFAULT_HEIGHT = 600;

// function wrapLines(
//   text: string,
//   w: number,
//   fontPx = 12,
//   maxLines = 3
// ): string[] {
//   const words = text.split(/\s+/);
//   const lines: string[] = [];
//   let line = "";
//   const approxCharW = fontPx * 0.6;
//   const maxChars = Math.max(1, Math.floor((w - 10) / approxCharW));
//   for (const word of words) {
//     const test = line ? line + " " + word : word;
//     if (test.length <= maxChars) line = test;
//     else {
//       lines.push(line);
//       line = word;
//       if (lines.length === maxLines - 1) break;
//     }
//   }
//   if (line && lines.length < maxLines) lines.push(line);
//   if (
//     lines.length === maxLines &&
//     words.join(" ").length > lines.join(" ").length
//   ) {
//     lines[maxLines - 1] = lines[maxLines - 1].replace(/\.*$/, "") + "…";
//   }
//   return lines;
// }

// export default function ZoomableTreemap({
//   data,
//   width = DEFAULT_WIDTH,
//   height = DEFAULT_HEIGHT,
//   measuredWidth,
//   measuredHeight,
//   formatValue = d3.format(","),
//   colorAccessor,
//   onDrillDown,
//   onZoomOut,
//   drillEnabled = true,
//   getNextLevelTree,
// }: Props) {
//   const W = measuredWidth ?? width;
//   const H = measuredHeight ?? height;

//   // ----- Layout for CURRENT level -----
//   const root = useMemo<d3.HierarchyRectangularNode<TreeNode>>(() => {
//     const h = d3
//       .hierarchy<TreeNode>(data)
//       .sum((d) => d.value ?? 0)
//       .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
//     const layout = d3
//       .treemap<TreeNode>()
//       .tile(d3.treemapResquarify)
//       .size([W, H])
//       .paddingInner(1)
//       .paddingTop(0);
//     return layout(h);
//   }, [data, W, H]);

//   const nodes = root.children ?? [];

//   // Default color by index (stable modulo palette)
//   const color = useMemo(() => {
//     if (colorAccessor)
//       return (d: d3.HierarchyRectangularNode<TreeNode>, i?: number) =>
//         colorAccessor(d, i);
//     const scale = d3
//       .scaleOrdinal<number, string>()
//       .range([...d3.schemeTableau10]);
//     return (_d: d3.HierarchyRectangularNode<TreeNode>, i = 0) => scale(i % 10);
//   }, [colorAccessor]);

//   // ----- VIEW TRANSFORM (Observable-like zoom feel) -----
//   // view = [cx, cy, w] in treemap space
//   const [view, setView] = useState<[number, number, number]>([
//     W / 2,
//     H / 2,
//     Math.max(W, H),
//   ]);
//   useEffect(() => {
//     setView([W / 2, H / 2, Math.max(W, H)]);
//   }, [W, H]);

//   // Keep a stack of rects we’ve drilled into (to support smooth zoom-out)
//   const rectStackRef = useRef<Rect[]>([]);

//   // Overlay for "incoming" children during zoom-in (fades in as we zoom)
//   type OverlayNode = {
//     x0: number;
//     y0: number;
//     x1: number;
//     y1: number;
//     name: string;
//     value?: number;
//   };
//   const [overlay, setOverlay] = useState<{
//     nodes: OverlayNode[];
//     alpha: number;
//   } | null>(null);

//   // Utility: run an interpolateZoom and call onFrame(t) + onEnd()
//   const runZoom = (
//     from: [number, number, number],
//     to: [number, number, number],
//     dur = 750,
//     onFrame?: (t: number) => void,
//     onEnd?: () => void
//   ) => {
//     const i = d3.interpolateZoom(from, to);
//     const t0 = performance.now();
//     let raf = 0;
//     const tick = (now: number) => {
//       const t = Math.min(1, (now - t0) / dur);
//       setView(i(t));
//       onFrame?.(t);
//       if (t < 1) raf = requestAnimationFrame(tick);
//       else onEnd?.();
//     };
//     raf = requestAnimationFrame(tick);
//     return () => cancelAnimationFrame(raf);
//   };

//   // Compose transform matrix for current view
//   const [cx, cy, vw] = view;
//   const k = W / vw;
//   const viewTransform = `translate(${W / 2},${
//     H / 2
//   }) scale(${k}) translate(${-cx},${-cy})`;

//   // Helper: compute child layout for the NEXT level and rescale it to fit a parent rect
//   const buildOverlayChildren = (
//     parentRect: Rect,
//     raw: RawNode
//   ): OverlayNode[] => {
//     if (!getNextLevelTree) return [];
//     const nextTree = getNextLevelTree(raw);
//     if (!nextTree) return [];
//     const h = d3
//       .hierarchy<TreeNode>(nextTree)
//       .sum((d) => d.value ?? 0)
//       .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
//     const layout = d3
//       .treemap<TreeNode>()
//       .tile(d3.treemapResquarify)
//       .size([W, H])
//       .paddingInner(1)
//       .paddingTop(0);
//     const nextRoot = layout(h);
//     const children = nextRoot.children ?? [];

//     // Rescale to parentRect (Observable's tile-rescale trick)
//     const px0 = parentRect.x0,
//       px1 = parentRect.x1;
//     const py0 = parentRect.y0,
//       py1 = parentRect.y1;
//     const sx = (px1 - px0) / W;
//     const sy = (py1 - py0) / H;

//     return children.map((c) => ({
//       x0: px0 + c.x0 * sx,
//       x1: px0 + c.x1 * sx,
//       y0: py0 + c.y0 * sy,
//       y1: py0 + c.y1 * sy,
//       name: c.data.name,
//       value: c.value,
//     }));
//   };

//   // Click tile → zoom IN with overlay fade-in, then drill
//   const handleTileClick = (
//     d: d3.HierarchyRectangularNode<TreeNode>,
//     i: number
//   ) => {
//     if (!drillEnabled || !d.data.__raw) return;

//     const rect: Rect = { x0: d.x0, x1: d.x1, y0: d.y0, y1: d.y1 };

//     // Prepare overlay of next-level children inside the clicked rect
//     const overlayNodes = buildOverlayChildren(rect, d.data.__raw);
//     if (overlayNodes.length > 0) setOverlay({ nodes: overlayNodes, alpha: 0 });

//     // Push this rect for future zoom-out target
//     rectStackRef.current.push(rect);

//     // Animate the view from current state to the clicked rect; fade in overlay during zoom
//     const to: [number, number, number] = [
//       (rect.x0 + rect.x1) / 2,
//       (rect.y0 + rect.y1) / 2,
//       Math.max(rect.x1 - rect.x0, rect.y1 - rect.y0),
//     ];

//     runZoom(
//       view,
//       to,
//       750,
//       (t) => {
//         if (overlayNodes.length > 0) {
//           // Ease in overlay while zooming
//           setOverlay((prev) =>
//             prev ? { ...prev, alpha: d3.easeCubicInOut(t) } : prev
//           );
//         }
//       },
//       () => {
//         // After the zoom completes, actually drill the data (no reset!)
//         onDrillDown?.(d.data.__raw!, rect);
//         // Clear overlay—new data now fills the view at this zoom level
//         setOverlay(null);
//       }
//     );
//   };

//   // Background click → zoom OUT to previous rect, then notify container to go up one level
//   const handleBackgroundClick = () => {
//     if (rectStackRef.current.length === 0) {
//       onZoomOut?.(); // at top already; no animation target
//       return;
//     }
//     // Current view is at rectStack.last; we need to go to the previous rect (parent)
//     // Pop the current rect and find the new last (parent). If none, zoom back to full.
//     rectStackRef.current.pop();
//     const target = rectStackRef.current[rectStackRef.current.length - 1];
//     const to: [number, number, number] = target
//       ? [
//           (target.x0 + target.x1) / 2,
//           (target.y0 + target.y1) / 2,
//           Math.max(target.x1 - target.x0, target.y1 - target.y0),
//         ]
//       : [W / 2, H / 2, Math.max(W, H)];

//     runZoom(view, to, 750, undefined, () => {
//       onZoomOut?.();
//       // If we reached the very top, clear the stack
//       if (!target) rectStackRef.current = [];
//     });
//   };

//   return (
//     <div style={{ position: "relative", width: "100%", height: "100%" }}>
//       <svg width={W} height={H} style={{ display: "block" }}>
//         {/* Background: click to go up */}
//         <rect
//           x={0}
//           y={0}
//           width={W}
//           height={H}
//           fill="white"
//           onClick={handleBackgroundClick}
//         />

//         {/* Current level group */}
//         <g transform={viewTransform}>
//           {nodes.map((d, i) => {
//             const w = d.x1 - d.x0;
//             const h = d.y1 - d.y0;
//             const lines = wrapLines(d.data.name, w, 12, 3);
//             const hasVal = typeof d.value === "number" && (d.value ?? 0) > 0;

//             return (
//               <g
//                 key={`${d.data.name}-${i}-${d.x0}-${d.y0}`}
//                 transform={`translate(${d.x0},${d.y0})`}
//                 style={{ cursor: drillEnabled ? "pointer" : "default" }}
//                 onClick={(e) => {
//                   e.stopPropagation();
//                   handleTileClick(d, i);
//                 }}
//               >
//                 <rect
//                   width={w}
//                   height={h}
//                   fill={color(d, i)}
//                   opacity={0.9}
//                   stroke="white"
//                   strokeWidth={1}
//                   rx={3}
//                   ry={3}
//                 />
//                 {h > 18 && (
//                   <>
//                     {lines.map((ln, li) => (
//                       <text
//                         key={li}
//                         x={6}
//                         y={14 + li * 14}
//                         fontSize={12}
//                         fontWeight={600}
//                         fill="white"
//                         pointerEvents="none"
//                         style={{ textShadow: "0 1px 1px rgba(0,0,0,0.35)" }}
//                       >
//                         {ln}
//                       </text>
//                     ))}
//                     {hasVal && h > 32 && (
//                       <text
//                         x={6}
//                         y={14 + lines.length * 14 + 12}
//                         fontSize={11}
//                         fill="white"
//                         opacity={0.9}
//                         pointerEvents="none"
//                       >
//                         {formatValue(d.value as number)}
//                       </text>
//                     )}
//                   </>
//                 )}
//                 <title>
//                   {d.data.name}
//                   {d.data.desc ? ` — ${d.data.desc}` : ""}
//                   {hasVal ? `\n${formatValue(d.value as number)}` : ""}
//                 </title>
//               </g>
//             );
//           })}
//         </g>

//         {/* Incoming children overlay (fades in as we zoom) */}
//         {overlay && overlay.nodes.length > 0 && (
//           <g
//             transform={viewTransform}
//             style={{ opacity: overlay.alpha, pointerEvents: "none" }}
//           >
//             {overlay.nodes.map((c, i) => {
//               const w = c.x1 - c.x0;
//               const h = c.y1 - c.y0;
//               const lines = wrapLines(c.name, w, 12, 3);
//               const hasVal = typeof c.value === "number" && (c.value ?? 0) > 0;
//               return (
//                 <g
//                   key={`${c.name}-${i}-${c.x0}-${c.y0}`}
//                   transform={`translate(${c.x0},${c.y0})`}
//                 >
//                   <rect width={w} height={h} fill="#000" opacity={0.08} />
//                   {h > 18 && (
//                     <>
//                       {lines.map((ln, li) => (
//                         <text
//                           key={li}
//                           x={6}
//                           y={14 + li * 14}
//                           fontSize={12}
//                           fontWeight={600}
//                           fill="black"
//                           opacity={0.75}
//                           pointerEvents="none"
//                         >
//                           {ln}
//                         </text>
//                       ))}
//                       {hasVal && h > 32 && (
//                         <text
//                           x={6}
//                           y={14 + lines.length * 14 + 12}
//                           fontSize={11}
//                           fill="black"
//                           opacity={0.6}
//                           pointerEvents="none"
//                         >
//                           {formatValue(c.value as number)}
//                         </text>
//                       )}
//                     </>
//                   )}
//                 </g>
//               );
//             })}
//           </g>
//         )}
//       </svg>
//     </div>
//   );
// }

// // import React, { useEffect, useMemo, useState } from "react";
// // import * as d3 from "d3";
// // import type { TreeNode, RawNode } from "./transform";

// // type Props = {
// //   /** One-level tree: a root whose children are the tiles to render. */
// //   data: TreeNode;
// //   width?: number;
// //   height?: number;
// //   measuredWidth?: number;
// //   measuredHeight?: number;
// //   formatValue?: (n: number) => string;
// //   colorAccessor?: (d: d3.HierarchyRectangularNode<TreeNode>) => string;
// //   /** Called after the zoom-in animation completes (to drill into this branch). */
// //   onDrillDown?: (raw: RawNode) => void;
// //   /** Called when user clicks the background (to go back up). */
// //   onZoomOut?: () => void;
// //   /** Disable drill when at the deepest level. */
// //   drillEnabled?: boolean;
// // };

// // const DEFAULT_WIDTH = 900;
// // const DEFAULT_HEIGHT = 600;

// // function wrapLines(
// //   text: string,
// //   w: number,
// //   fontPx = 12,
// //   maxLines = 3
// // ): string[] {
// //   const words = text.split(/\s+/);
// //   const lines: string[] = [];
// //   let line = "";
// //   const approxCharW = fontPx * 0.6;
// //   const maxChars = Math.max(1, Math.floor((w - 10) / approxCharW));
// //   for (const word of words) {
// //     const test = line ? line + " " + word : word;
// //     if (test.length <= maxChars) line = test;
// //     else {
// //       lines.push(line);
// //       line = word;
// //       if (lines.length === maxLines - 1) break;
// //     }
// //   }
// //   if (line && lines.length < maxLines) lines.push(line);
// //   if (
// //     lines.length === maxLines &&
// //     words.join(" ").length > lines.join(" ").length
// //   ) {
// //     lines[maxLines - 1] = lines[maxLines - 1].replace(/\.*$/, "") + "…";
// //   }
// //   return lines;
// // }

// // export default function ZoomableTreemap({
// //   data,
// //   width = DEFAULT_WIDTH,
// //   height = DEFAULT_HEIGHT,
// //   measuredWidth,
// //   measuredHeight,
// //   formatValue = d3.format(","),
// //   colorAccessor,
// //   onDrillDown,
// //   onZoomOut,
// //   drillEnabled = true,
// // }: Props) {
// //   const W = measuredWidth ?? width;
// //   const H = measuredHeight ?? height;

// //   // Build a rectangular hierarchy from the provided one-level data
// //   const root = useMemo<d3.HierarchyRectangularNode<TreeNode>>(() => {
// //     const h = d3
// //       .hierarchy<TreeNode>(data)
// //       .sum((d) => d.value ?? 0)
// //       .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

// //     const layout = d3
// //       .treemap<TreeNode>()
// //       .tile(d3.treemapResquarify)
// //       .size([W, H])
// //       .paddingInner(1)
// //       .paddingTop(0);

// //     return layout(h);
// //   }, [data, W, H]);

// //   const nodes = root.children ?? [];

// //   // Colors by index (or via custom accessor)
// //   const color = useMemo(() => {
// //     if (colorAccessor) {
// //       return (d: d3.HierarchyRectangularNode<TreeNode>) => colorAccessor(d);
// //     }
// //     const scale = d3
// //       .scaleOrdinal<number, string>()
// //       .range([...d3.schemeTableau10]);
// //     return (d: d3.HierarchyRectangularNode<TreeNode>, i?: number) =>
// //       scale((i ?? 0) % 10);
// //   }, [colorAccessor]);

// //   // --- View-transform zoom (Observable feel) --------------------------------
// //   // view = [cx, cy, w] in treemap coords; default fits the full canvas
// //   const [view, setView] = useState<[number, number, number]>([
// //     W / 2,
// //     H / 2,
// //     Math.max(W, H),
// //   ]);

// //   // Reset view on size change
// //   useEffect(() => {
// //     setView([W / 2, H / 2, Math.max(W, H)]);
// //   }, [W, H]);

// //   // Also reset (animate) whenever the data changes (e.g., after drill)
// //   useEffect(() => {
// //     const target: [number, number, number] = [W / 2, H / 2, Math.max(W, H)];
// //     const i = d3.interpolateZoom(view, target);
// //     const t0 = performance.now();
// //     const dur = 550;
// //     let raf = 0;
// //     const tick = (now: number) => {
// //       const t = Math.min(1, (now - t0) / dur);
// //       setView(i(t));
// //       if (t < 1) raf = requestAnimationFrame(tick);
// //     };
// //     raf = requestAnimationFrame(tick);
// //     return () => cancelAnimationFrame(raf);
// //     // eslint-disable-next-line react-hooks/exhaustive-deps
// //   }, [data]); // intentionally only on data identity

// //   const zoomToRect = (
// //     rect: { x0: number; y0: number; x1: number; y1: number },
// //     dur = 550,
// //     onEnd?: () => void
// //   ) => {
// //     const target: [number, number, number] = [
// //       (rect.x0 + rect.x1) / 2,
// //       (rect.y0 + rect.y1) / 2,
// //       Math.max(rect.x1 - rect.x0, rect.y1 - rect.y0),
// //     ];
// //     const i = d3.interpolateZoom(view, target);
// //     const t0 = performance.now();
// //     let raf = 0;
// //     const tick = (now: number) => {
// //       const t = Math.min(1, (now - t0) / dur);
// //       setView(i(t));
// //       if (t < 1) raf = requestAnimationFrame(tick);
// //       else onEnd?.();
// //     };
// //     raf = requestAnimationFrame(tick);
// //     return () => cancelAnimationFrame(raf);
// //   };

// //   // Compose the transform matrix
// //   const [cx, cy, vw] = view;
// //   const k = W / vw;
// //   const viewTransform = `translate(${W / 2},${
// //     H / 2
// //   }) scale(${k}) translate(${-cx},${-cy})`;

// //   return (
// //     <div style={{ position: "relative", width: "100%", height: "100%" }}>
// //       <svg width={W} height={H} style={{ display: "block" }}>
// //         {/* Background: click to go up */}
// //         <rect
// //           x={0}
// //           y={0}
// //           width={W}
// //           height={H}
// //           fill="white"
// //           onClick={() => {
// //             onZoomOut?.();
// //           }}
// //         />
// //         <g transform={viewTransform}>
// //           {nodes.map((d, i) => {
// //             const w = d.x1 - d.x0;
// //             const h = d.y1 - d.y0;
// //             const lines = wrapLines(d.data.name, w, 12, 3);
// //             const valOk = typeof d.value === "number" && (d.value ?? 0) > 0;

// //             return (
// //               <g
// //                 key={`${d.data.name}-${i}-${d.x0}-${d.y0}`}
// //                 transform={`translate(${d.x0},${d.y0})`}
// //                 style={{
// //                   cursor: drillEnabled ? "pointer" : "default",
// //                   transition: "opacity 200ms ease",
// //                 }}
// //                 onClick={(e) => {
// //                   e.stopPropagation();
// //                   if (!drillEnabled || !d.data.__raw) return;
// //                   // 1) Zoom the clicked rect to fill
// //                   zoomToRect(d, 600, () => {
// //                     // 2) Ask container to drill into this branch (it will update data)
// //                     onDrillDown?.(d.data.__raw!);
// //                   });
// //                 }}
// //               >
// //                 <rect
// //                   width={w}
// //                   height={h}
// //                   fill={color(d, i)}
// //                   opacity={0.9}
// //                   stroke="white"
// //                   strokeWidth={1}
// //                   rx={3}
// //                   ry={3}
// //                 />
// //                 {/* Labels */}
// //                 {h > 18 && (
// //                   <>
// //                     {lines.map((ln, li) => (
// //                       <text
// //                         key={li}
// //                         x={6}
// //                         y={14 + li * 14}
// //                         fontSize={12}
// //                         fontWeight={600}
// //                         fill="white"
// //                         pointerEvents="none"
// //                         style={{ textShadow: "0 1px 1px rgba(0,0,0,0.35)" }}
// //                       >
// //                         {ln}
// //                       </text>
// //                     ))}
// //                     {valOk && h > 32 && (
// //                       <text
// //                         x={6}
// //                         y={14 + lines.length * 14 + 12}
// //                         fontSize={11}
// //                         fill="white"
// //                         opacity={0.9}
// //                         pointerEvents="none"
// //                       >
// //                         {formatValue(d.value as number)}
// //                       </text>
// //                     )}
// //                   </>
// //                 )}
// //                 <title>
// //                   {d.data.name}
// //                   {d.data.desc ? ` — ${d.data.desc}` : ""}
// //                   {valOk ? `\n${formatValue(d.value as number)}` : ""}
// //                 </title>
// //               </g>
// //             );
// //           })}
// //         </g>
// //       </svg>
// //     </div>
// //   );
// // }

// // // import React, { useMemo, useState, useCallback } from "react";
// // // import * as d3 from "d3";

// // // // Your TreeNode from the transformer
// // // type TreeNode = {
// // //   name: string;
// // //   desc?: string;
// // //   level: 0 | 1 | 2;
// // //   value?: number;
// // //   children?: TreeNode[];
// // // };

// // // type Props = {
// // //   data: TreeNode;
// // //   width?: number;
// // //   height?: number;
// // //   measuredWidth?: number;
// // //   measuredHeight?: number;
// // //   formatValue?: (n: number) => string;
// // //   colorAccessor?: (d: d3.HierarchyRectangularNode<TreeNode>) => string;
// // // };

// // // const DEFAULT_WIDTH = 900;
// // // const DEFAULT_HEIGHT = 600;

// // // function fitLabel(label: string, w: number, charW = 7) {
// // //   const maxChars = Math.max(1, Math.floor((w - 10) / charW));
// // //   if (label.length <= maxChars) return label;
// // //   if (maxChars <= 3) return label.slice(0, Math.max(0, maxChars));
// // //   return label.slice(0, maxChars - 1) + "…";
// // // }

// // // export default function ZoomableTreemap({
// // //   data,
// // //   width = DEFAULT_WIDTH,
// // //   height = DEFAULT_HEIGHT,
// // //   measuredWidth,
// // //   measuredHeight,
// // //   formatValue = d3.format(","),
// // //   colorAccessor,
// // // }: Props) {
// // //   const W = measuredWidth ?? width;
// // //   const H = measuredHeight ?? height;

// // //   // ✅ Capture the return from the treemap layout:
// // //   const root = useMemo<d3.HierarchyRectangularNode<TreeNode>>(() => {
// // //     const hierarchy = d3
// // //       .hierarchy<TreeNode>(data)
// // //       .sum((d) => d.value ?? 0)
// // //       .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

// // //     const layout = d3
// // //       .treemap<TreeNode>()
// // //       .tile(d3.treemapResquarify)
// // //       .size([W, H])
// // //       .paddingInner(1)
// // //       .paddingTop((d) => (d.depth === 0 ? 0 : 20));

// // //     return layout(hierarchy); // <-- typed as HierarchyRectangularNode
// // //   }, [data, W, H]);

// // //   // ✅ Everything downstream keeps the rectangular type:
// // //   const [focus, setFocus] =
// // //     useState<d3.HierarchyRectangularNode<TreeNode>>(root);

// // //   const color = useMemo(() => {
// // //     if (colorAccessor)
// // //       return (d: d3.HierarchyRectangularNode<TreeNode>) => colorAccessor(d);
// // //     const parents = root.children?.map((d) => d.data.name) ?? [];
// // //     const scale = d3
// // //       .scaleOrdinal<string, string>()
// // //       .domain(parents)
// // //       .range([...d3.schemeTableau10]); // spread to avoid readonly→mutable issues

// // //     const top1 = (d: d3.HierarchyRectangularNode<TreeNode>) =>
// // //       d.ancestors().find((a) => a.depth === 1)?.data.name ?? d.data.name;

// // //     return (d: d3.HierarchyRectangularNode<TreeNode>) => scale(top1(d));
// // //   }, [root, colorAccessor]);

// // //   const viewCoords = useCallback(
// // //     (node: d3.HierarchyRectangularNode<TreeNode>) => {
// // //       const kx = W / (focus.x1 - focus.x0 || 1);
// // //       const ky = H / (focus.y1 - focus.y0 || 1);
// // //       const ox = -focus.x0;
// // //       const oy = -focus.y0;
// // //       const x0 = (node.x0 + ox) * kx;
// // //       const x1 = (node.x1 + ox) * kx;
// // //       const y0 = (node.y0 + oy) * ky;
// // //       const y1 = (node.y1 + oy) * ky;
// // //       return { x0, y0, w: x1 - x0, h: y1 - y0 };
// // //     },
// // //     [focus, W, H]
// // //   );

// // //   const handleZoom = useCallback(
// // //     (n?: d3.HierarchyRectangularNode<TreeNode>) => {
// // //       if (n) setFocus(n);
// // //     },
// // //     []
// // //   );

// // //   // ✅ descendants() are rectangular nodes too
// // //   const nodes = root.descendants();
// // //   const isLeaf = (d: d3.HierarchyRectangularNode<TreeNode>) =>
// // //     !d.children || d.children.length === 0;
// // //   const breadcrumb = focus.ancestors().reverse();

// // //   return (
// // //     <div style={{ position: "relative", width: "100%", height: "100%" }}>
// // //       <div
// // //         style={{
// // //           position: "absolute",
// // //           top: 8,
// // //           left: 12,
// // //           zIndex: 2,
// // //           fontSize: 12,
// // //         }}
// // //       >
// // //         {breadcrumb.map((n, i) => {
// // //           const isLast = i === breadcrumb.length - 1;
// // //           return (
// // //             <span key={i}>
// // //               <button
// // //                 onClick={() => handleZoom(n)}
// // //                 disabled={isLast}
// // //                 style={{
// // //                   border: "none",
// // //                   background: "none",
// // //                   cursor: isLast ? "default" : "pointer",
// // //                   fontWeight: isLast ? 700 : 500,
// // //                   opacity: isLast ? 1 : 0.8,
// // //                   padding: 0,
// // //                 }}
// // //                 title={n.data.desc || n.data.name}
// // //               >
// // //                 {n.data.name}
// // //               </button>
// // //               {i < breadcrumb.length - 1 && <span> › </span>}
// // //             </span>
// // //           );
// // //         })}
// // //       </div>

// // //       <svg width={W} height={H} style={{ display: "block" }}>
// // //         <rect
// // //           x={0}
// // //           y={0}
// // //           width={W}
// // //           height={H}
// // //           fill="white"
// // //           onClick={() => handleZoom(focus.parent ?? root)}
// // //         />
// // //         <g>
// // //           {nodes.map((d) => {
// // //             const isDesc = focus === d || d.ancestors().includes(focus);
// // //             if (!isDesc) return null;

// // //             const { x0, y0, w, h } = viewCoords(d);
// // //             const showText = w > 70 && h > 24;

// // //             return (
// // //               <g
// // //                 key={`${d.depth}-${d.data.name}-${d.x0}-${d.y0}`}
// // //                 transform={`translate(${x0},${y0})`}
// // //                 onClick={(e) => {
// // //                   e.stopPropagation();
// // //                   if (d.children) handleZoom(d);
// // //                 }}
// // //                 style={{
// // //                   cursor: d.children ? "pointer" : "default",
// // //                   transition: "transform 250ms ease, opacity 250ms ease",
// // //                 }}
// // //               >
// // //                 <rect
// // //                   width={w}
// // //                   height={h}
// // //                   fill={color(d)}
// // //                   opacity={isLeaf(d) ? 0.92 : 0.75}
// // //                   stroke="white"
// // //                   strokeWidth={1}
// // //                   rx={3}
// // //                   ry={3}
// // //                 />
// // //                 {showText && (
// // //                   <>
// // //                     <text
// // //                       x={6}
// // //                       y={16}
// // //                       fontSize={12}
// // //                       fontWeight={600}
// // //                       fill="white"
// // //                       pointerEvents="none"
// // //                       style={{ textShadow: "0 1px 1px rgba(0,0,0,0.35)" }}
// // //                     >
// // //                       {fitLabel(d.data.name, w)}
// // //                     </text>
// // //                     {typeof d.value === "number" && d.value > 0 && (
// // //                       <text
// // //                         x={6}
// // //                         y={32}
// // //                         fontSize={11}
// // //                         fill="white"
// // //                         opacity={0.9}
// // //                         pointerEvents="none"
// // //                       >
// // //                         {formatValue(d.value)}
// // //                       </text>
// // //                     )}
// // //                   </>
// // //                 )}
// // //                 <title>
// // //                   {d.data.name}
// // //                   {d.data.desc ? ` — ${d.data.desc}` : ""}
// // //                   {typeof d.value === "number"
// // //                     ? `\n${formatValue(d.value)}`
// // //                     : ""}
// // //                 </title>
// // //               </g>
// // //             );
// // //           })}
// // //         </g>
// // //       </svg>
// // //     </div>
// // //   );
// // // }
