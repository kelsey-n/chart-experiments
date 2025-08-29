import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import * as d3 from "d3";
import "./Treemap.css";

/* ===================== Your data types ===================== */

export type RawNode = {
  level: number; // 2 (top), 1, 0 (lowest)
  cluster_name: string;
  cluster_description?: string;
  variable?: {
    count?: {
      country?: Record<string, number | undefined>;
      global?: { GLOBAL?: number };
      state_us?: Record<string, number | undefined>;
    };
    pct?: {
      country?: Record<string, number | undefined>;
      global?: { GLOBAL?: number };
      state_us?: Record<string, number | undefined>;
    };
  };
  children?: RawNode[];
};

export type RawHierarchy = {
  request_hierarchy: RawNode[];
};

export type MetricMode = "global" | "country" | "state_us";
export type ValueSource = "count" | "pct";

export type TreeNode = {
  name: string;
  desc?: string;
  level: number; // mirrored from RawNode.level
  value?: number; // per-level value used for layout
  children?: TreeNode[];
  __raw?: RawNode; // for drilling into its subtree
};

/* ===================== Utilities ===================== */

// Flexible accessor: supports count or pct, and metric dimension.
function extractValueFlexible(
  raw?: RawNode,
  metric: MetricMode = "global",
  geoCode?: string,
  source: ValueSource = "count"
): number {
  if (!raw || !raw.variable) return 0;
  const container = raw.variable[source];
  if (!container) return 0;

  if (metric === "global") {
    const v = container.global?.GLOBAL;
    return Number.isFinite(v) ? (v as number) : 0;
  }
  if (metric === "country" && geoCode) {
    const v = container.country?.[geoCode];
    return Number.isFinite(v) ? (v as number) : 0;
  }
  if (metric === "state_us" && geoCode) {
    const v = container.state_us?.[geoCode];
    return Number.isFinite(v) ? (v as number) : 0;
  }
  return 0;
}

// Wrap the whole hierarchy in a synthetic root (level 3) for convenience.
function makeSyntheticRoot(h: RawHierarchy): RawNode {
  return {
    level: 3, // synthetic (above 2)
    cluster_name: "root",
    cluster_description: "Synthetic root",
    children: h.request_hierarchy ?? [],
  };
}

// Collect all RawNodes under subtree that match a specific level.
function collectAtLevel(
  subtree: RawNode,
  level: number,
  out: RawNode[] = []
): RawNode[] {
  if (subtree.level === level) out.push(subtree);
  subtree.children?.forEach((ch) => collectAtLevel(ch, level, out));
  return out;
}

/**
 * Build a one-level projection view for a given subtree+level using the metric & value source.
 * This enforces "per-level values only" and filters zero/missing before layout.
 */
function projectLevel(
  subtree: RawNode,
  level: number,
  metric: MetricMode,
  source: ValueSource,
  geoCode?: string
): TreeNode {
  const kids: TreeNode[] = collectAtLevel(subtree, level).map((rn) => {
    const val = extractValueFlexible(rn, metric, geoCode, source);
    return {
      name: rn.cluster_name,
      desc: rn.cluster_description,
      level: rn.level,
      value: val,
      __raw: rn,
    };
  });

  const filtered = kids.filter(
    (k) => Number.isFinite(k.value) && (k.value as number) > 0
  );
  return { name: `level-${level}`, level, children: filtered };
}

/* ===================== Sizing hook (ResizeObserver) ===================== */

function useSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const cr = entry.contentRect;
      setSize({ width: cr.width, height: cr.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/* ===================== Component ===================== */

type TreemapMVPProps = {
  data: RawHierarchy;

  // how to read values
  metric: MetricMode; // "global" | "country" | "state_us"
  valueSource?: ValueSource; // "count" | "pct"  (default "count")
  geoCode?: string; // needed for "country"/"state_us"

  // start at the TOP level in your data (2)
  initialLevel?: 2 | 1 | 0; // default 2

  // layout + labels
  paddingInner?: number;
  paddingOuter?: number;
  minLabelPx?: number;

  className?: string;
  colorForNode?: (node: d3.HierarchyRectangularNode<TreeNode>) => string;
};

// simple depth-based default palette
function defaultColor(n: d3.HierarchyRectangularNode<TreeNode>) {
  const colors = [
    "#1f2937",
    "#2563eb",
    "#10b981",
    "#f59e0b",
    "#e11d48",
    "#7c3aed",
  ];
  return colors[(n.depth || 0) % colors.length];
}

export default function TreemapMVP({
  data,
  metric,
  valueSource = "count",
  geoCode,
  initialLevel = 2,
  paddingInner = 2,
  paddingOuter = 2,
  minLabelPx = 42,
  className,
  colorForNode,
}: TreemapMVPProps) {
  const [wrapRef, { width, height }] = useSize<HTMLDivElement>();

  // Focus = which RawNode subtree + which level we’re projecting right now
  const syntheticRoot = useMemo(() => makeSyntheticRoot(data), [data]);
  const [focusRaw, setFocusRaw] = useState<RawNode>(() => syntheticRoot);
  const [level, setLevel] = useState<number>(initialLevel);

  // reset when data or initialLevel changes
  useEffect(() => {
    setFocusRaw(syntheticRoot);
    setLevel(initialLevel);
  }, [syntheticRoot, initialLevel]);

  // Build per-level projection (zeros filtered here)
  const view: TreeNode = useMemo(
    () => projectLevel(focusRaw, level, metric, valueSource, geoCode),
    [focusRaw, level, metric, valueSource, geoCode]
  );

  // Build hierarchy for treemap. Important: we avoid mutating .value directly (readonly).
  // Using .sum(d => d.value ?? 0) is safe here because leaves retain their per-level values;
  // roll-up only affects the synthetic wrapper node, which we don't render as a tile.
  const root = useMemo(() => {
    const h = d3
      .hierarchy<TreeNode>(view, (d) => d.children ?? [])
      .sum((d) => d.value ?? 0);

    d3
      .treemap<TreeNode>()
      .tile(d3.treemapBinary)
      .size([Math.max(1, width), Math.max(1, height)])
      .paddingInner(paddingInner)
      .paddingOuter(paddingOuter)(h as d3.HierarchyRectangularNode<TreeNode>);

    return h as d3.HierarchyRectangularNode<TreeNode>;
  }, [view, width, height, paddingInner, paddingOuter]);

  // We render the leaves (each is one node at the target level)
  const nodes = root.leaves();

  // Drill if the underlying RAW children include nodes at the NEXT LOWER level (level - 1)
  const canDrillToNextLevel = useCallback(
    (rn?: RawNode | null) =>
      !!rn?.children?.some((ch) => ch.level === level - 1),
    [level]
  );

  // Background/Esc goes up toward the top (increase level)
  const goUp = useCallback(() => {
    if (level < initialLevel) {
      setLevel((d) => d + 1); // e.g., 0->1 or 1->2
      return;
    }
    // already at top; reset focus to all (synthetic root)
    if (focusRaw !== syntheticRoot) {
      setFocusRaw(syntheticRoot);
      setLevel(initialLevel);
    }
  }, [level, initialLevel, focusRaw, syntheticRoot]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") goUp();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goUp]);

  // Breadcrumb text
  const crumb = useMemo(() => {
    const parts: string[] = [];
    if (focusRaw !== syntheticRoot) parts.push(focusRaw.cluster_name);
    parts.push(`Level ${level}`);
    parts.push(
      `${metric}${metric !== "global" && geoCode ? `:${geoCode}` : ""}`
    );
    parts.push(valueSource);
    return parts.join(" • ");
  }, [focusRaw, syntheticRoot, level, metric, geoCode, valueSource]);

  return (
    <div ref={wrapRef} className={`treemap-wrap ${className ?? ""}`}>
      <svg className="treemap-svg" role="img" aria-label="Treemap">
        <rect
          className="treemap-bg"
          x={0}
          y={0}
          width={width}
          height={height}
          onClick={goUp}
        />

        {nodes.map((n, i) => {
          const x = n.x0,
            y = n.y0;
          const w = Math.max(0, n.x1 - n.x0);
          const h = Math.max(0, n.y1 - n.y0);
          if (w <= 0 || h <= 0) return null;

          const tn = n.data;
          const label = tn.name;
          const showLabel = w > minLabelPx && h > 18;
          const fill = colorForNode ? colorForNode(n) : defaultColor(n);

          const drillable = canDrillToNextLevel(tn.__raw);

          return (
            <g
              key={`${label}-${i}`}
              transform={`translate(${x},${y})`}
              tabIndex={0}
              role={drillable ? "button" : "group"}
              aria-label={`Tile ${label}, value ${tn.value ?? 0}`}
              className="treemap-node"
              onClick={(e) => {
                e.stopPropagation();
                if (drillable && tn.__raw) {
                  setFocusRaw(tn.__raw);
                  setLevel((d) => d - 1); // 2->1->0
                }
              }}
              onKeyDown={(e) => {
                if (
                  (e.key === "Enter" || e.key === " ") &&
                  drillable &&
                  tn.__raw
                ) {
                  e.preventDefault();
                  setFocusRaw(tn.__raw);
                  setLevel((d) => d - 1);
                }
              }}
            >
              <rect
                className="treemap-rect"
                width={w}
                height={h}
                rx={4}
                style={{ fill }}
              />
              {showLabel && (
                <foreignObject width={w} height={h} pointerEvents="none">
                  <div className="treemap-fo">
                    <div className="treemap-title" title={label}>
                      {label}
                    </div>
                    <div className="treemap-sub">{tn.value ?? 0}</div>
                  </div>
                </foreignObject>
              )}
              <title>{`${label} • ${tn.value ?? 0}${
                drillable ? " • Click to drill" : ""
              }`}</title>
            </g>
          );
        })}

        <g transform="translate(8,16)">
          <text className="treemap-crumb">{crumb}</text>
        </g>
      </svg>

      <div className="treemap-help">
        Click a tile to drill (2→1→0) • Click background or press Esc to go back
      </div>
    </div>
  );
}

// import React, {
//   useEffect,
//   useMemo,
//   useRef,
//   useState,
//   useCallback,
// } from "react";
// import * as d3 from "d3";
// import "./Treemap.css";
// // IMPORT USESIZE

// // ====== Types and utils from your snippet (import from your file if you prefer) ======
// export type RawNode = {
//   level: number;
//   cluster_name: string;
//   cluster_description?: string;
//   variable?: {
//     count?: {
//       country?: Record<string, number | undefined>;
//       global?: { GLOBAL?: number };
//       state_us?: Record<string, number | undefined>;
//     };
//   };
//   children?: RawNode[];
// };

// export type RawHierarchy = {
//   request_hierarchy: RawNode[];
// };

// export type MetricMode = "global" | "country" | "state_us";

// export type TreeNode = {
//   name: string;
//   desc?: string;
//   level: number;
//   value?: number;
//   children?: TreeNode[];
//   __raw?: RawNode;
// };

// export function extractValue(
//   raw?: RawNode,
//   metric: MetricMode = "global",
//   geoCode?: string
// ): number {
//   const counts = raw?.variable?.count ?? {};
//   if (metric === "global") {
//     const v = counts.global?.GLOBAL;
//     return Number.isFinite(v) ? (v as number) : 0;
//   }
//   if (metric === "country" && geoCode) {
//     const v = counts.country?.[geoCode];
//     return Number.isFinite(v) ? (v as number) : 0;
//   }
//   if (metric === "state_us" && geoCode) {
//     const v = counts.state_us?.[geoCode];
//     return Number.isFinite(v) ? (v as number) : 0;
//   }
//   return 0;
// }

// export function makeSyntheticRoot(h: RawHierarchy): RawNode {
//   return {
//     level: 3, // synthetic root above your normal 0..2
//     cluster_name: "root",
//     cluster_description: "Synthetic root",
//     children: h.request_hierarchy ?? [],
//   };
// }

// export function collectAtLevel(
//   subtree: RawNode,
//   level: number,
//   out: RawNode[] = []
// ): RawNode[] {
//   if (subtree.level === level) out.push(subtree);
//   subtree.children?.forEach((ch) => collectAtLevel(ch, level, out));
//   return out;
// }

// export function projectLevel(
//   subtree: RawNode,
//   level: number,
//   metric: MetricMode,
//   geoCode?: string
// ): TreeNode {
//   const kids: TreeNode[] = collectAtLevel(subtree, level).map((rn) => {
//     const val = extractValue(rn, metric, geoCode);
//     return {
//       name: rn.cluster_name,
//       desc: rn.cluster_description,
//       level: rn.level,
//       value: val,
//       __raw: rn,
//     };
//   });

//   const filtered = kids.filter(
//     (k) => Number.isFinite(k.value) && (k.value as number) > 0
//   );
//   return { name: `level-${level}`, level, children: filtered };
// }
// // ====== end of imported block ======

// // // Simple container size hook
// // function useSize<T extends HTMLElement>() {
// //   const ref = useRef<T | null>(null);
// //   const [size, setSize] = useState({ width: 0, height: 0 });
// //   useEffect(() => {
// //     const el = ref.current;
// //     if (!el) return;
// //     const ro = new ResizeObserver(([entry]) => {
// //       const cr = entry.contentRect;
// //       setSize({ width: cr.width, height: cr.height });
// //     });
// //     ro.observe(el);
// //     return () => ro.disconnect();
// //   }, []);
// //   return [ref, size] as const;
// // }

// // Props for the MVP
// type TreemapMVPProps = {
//   data: RawHierarchy;
//   metric: MetricMode;
//   geoCode?: string; // required for "country" or "state_us"
//   initialLevel?: number; // 0, 1, or 2; default 0
//   paddingInner?: number;
//   paddingOuter?: number;
//   minLabelPx?: number;
//   className?: string;
//   // optional custom color
//   colorForNode?: (node: d3.HierarchyRectangularNode<TreeNode>) => string;
// };

// // Default depth-based color
// function defaultColor(n: d3.HierarchyRectangularNode<TreeNode>) {
//   const colors = [
//     "#1f2937",
//     "#2563eb",
//     "#10b981",
//     "#f59e0b",
//     "#e11d48",
//     "#7c3aed",
//   ];
//   return colors[(n.depth || 0) % colors.length];
// }

// export default function TreemapMVP({
//   data,
//   metric,
//   geoCode,
//   initialLevel = 0,
//   paddingInner = 2,
//   paddingOuter = 2,
//   minLabelPx = 42,
//   className,
//   colorForNode,
// }: TreemapMVPProps) {
//   const [wrapRef, { width, height }] = useSize<HTMLDivElement>();

//   // We navigate by a pair: the RawNode subtree we're focused on, and the level we want to display.
//   // Start at synthetic root (entire space) and show `initialLevel`.
//   const syntheticRoot = useMemo(() => makeSyntheticRoot(data), [data]);
//   const [focusRaw, setFocusRaw] = useState<RawNode>(() => syntheticRoot);
//   const [level, setLevel] = useState<number>(initialLevel);

//   // Re-center focus if the data object identity changes
//   useEffect(() => {
//     setFocusRaw(syntheticRoot);
//     setLevel(initialLevel);
//   }, [syntheticRoot, initialLevel]);

//   // Build a one-level projection (no roll-ups; zeros are already filtered)
//   const view: TreeNode = useMemo(
//     () => projectLevel(focusRaw, level, metric, geoCode),
//     [focusRaw, level, metric, geoCode]
//   );

//   // Build d3 hierarchy strictly from this one-level projection
//   const root = useMemo(() => {
//     const h = d3.hierarchy<TreeNode>(view, (d) => d.children ?? []);
//     // D3 treemap uses n.value for layout; we already have per-node value
//     h.each((n) => (n.value = (n.data.value ?? 0) as number));

//     d3
//       .treemap<TreeNode>()
//       .tile(d3.treemapBinary)
//       .size([Math.max(1, width), Math.max(1, height)])
//       .paddingInner(paddingInner)
//       .paddingOuter(paddingOuter)(h as d3.HierarchyRectangularNode<TreeNode>);

//     return h as d3.HierarchyRectangularNode<TreeNode>;
//   }, [view, width, height, paddingInner, paddingOuter]);

//   // Since we project only one level at a time, the "descendants" are just one depth.
//   const nodes = root.leaves();

//   const onBgClick = useCallback(() => {
//     // go up: if we're above initialLevel, decrease level
//     // else, if not at synthetic root, move to synthetic root’s parent (i.e., reset)
//     if (level > initialLevel) {
//       setLevel((d) => d - 1);
//       return;
//     }
//     if (focusRaw !== syntheticRoot) {
//       setFocusRaw(syntheticRoot);
//       setLevel(initialLevel);
//     }
//   }, [level, initialLevel, focusRaw, syntheticRoot]);

//   // Keyboard Esc to back out
//   useEffect(() => {
//     const onKey = (e: KeyboardEvent) => {
//       if (e.key === "Escape") onBgClick();
//     };
//     window.addEventListener("keydown", onKey);
//     return () => window.removeEventListener("keydown", onKey);
//   }, [onBgClick]);

//   // Breadcrumb text based on current focus + level
//   const crumb = useMemo(() => {
//     const parts: string[] = [];
//     // try to show the focused cluster name if it's not the synthetic root
//     if (focusRaw !== syntheticRoot) parts.push(focusRaw.cluster_name);
//     parts.push(`Level ${level}`);
//     return parts.join(" › ");
//   }, [focusRaw, syntheticRoot, level]);

//   return (
//     <div ref={wrapRef} className={`treemap-wrap ${className ?? ""}`}>
//       <svg className="treemap-svg" role="img" aria-label="Treemap">
//         <rect
//           className="treemap-bg"
//           x={0}
//           y={0}
//           width={width}
//           height={height}
//           onClick={onBgClick}
//         />

//         {nodes.map((n, i) => {
//           const x = n.x0;
//           const y = n.y0;
//           const w = Math.max(0, n.x1 - n.x0);
//           const h = Math.max(0, n.y1 - n.y0);
//           if (w <= 0 || h <= 0) return null;

//           const tn = n.data;
//           const label = tn.name;
//           const showLabel = w > minLabelPx && h > 18;
//           const fill = colorForNode ? colorForNode(n) : defaultColor(n);

//           // If a tile has children in the underlying RAW hierarchy at the next level, we let it drill.
//           // Next level is (level + 1). We determine existence by checking tn.__raw subtree.
//           const canDrill =
//             !!tn.__raw &&
//             Array.isArray(tn.__raw.children) &&
//             tn.__raw.children.some((ch) => ch.level === level + 1);

//           return (
//             <g
//               key={`${label}-${i}`}
//               transform={`translate(${x},${y})`}
//               tabIndex={0}
//               role={canDrill ? "button" : "group"}
//               aria-label={`Tile ${label}, value ${tn.value ?? 0}`}
//               className="treemap-node"
//               onClick={(e) => {
//                 e.stopPropagation();
//                 if (canDrill && tn.__raw) {
//                   setFocusRaw(tn.__raw);
//                   setLevel(level + 1);
//                 }
//               }}
//               onKeyDown={(e) => {
//                 if (
//                   (e.key === "Enter" || e.key === " ") &&
//                   canDrill &&
//                   tn.__raw
//                 ) {
//                   e.preventDefault();
//                   setFocusRaw(tn.__raw);
//                   setLevel(level + 1);
//                 }
//               }}
//             >
//               <rect
//                 className="treemap-rect"
//                 width={w}
//                 height={h}
//                 rx={4}
//                 style={{ fill }}
//               />
//               {showLabel && (
//                 <foreignObject width={w} height={h} pointerEvents="none">
//                   <div className="treemap-fo">
//                     <div className="treemap-title" title={label}>
//                       {label}
//                     </div>
//                     <div className="treemap-sub">{tn.value ?? 0}</div>
//                   </div>
//                 </foreignObject>
//               )}
//               <title>{`${label} • ${tn.value ?? 0}${
//                 canDrill ? " • Click to drill" : ""
//               }`}</title>
//             </g>
//           );
//         })}

//         <g transform="translate(8,16)">
//           <text className="treemap-crumb">{crumb}</text>
//         </g>
//       </svg>

//       <div className="treemap-help">
//         Click a tile to drill to the next level • Click background or press Esc
//         to go back
//       </div>
//     </div>
//   );
// }
