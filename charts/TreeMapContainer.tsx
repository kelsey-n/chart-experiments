import React, { useEffect, useState } from "react";
import TreeMap from "./TreeMap";
import { type RawHierarchy, type MetricMode } from "./transform";
// import { useSize } from "@/hooks/useSize";

export default function TreemapContainer({ raw }: { raw: RawHierarchy }) {
  const [metric, setMetric] = useState<MetricMode>("global");
  const [geoCode, setGeoCode] = useState<string | undefined>(undefined);

  // Force a clean remount of the D3 island when metric/geo changes
  const key = `${metric}:${geoCode ?? ""}`;

  useEffect(() => {
    if (metric === "global") setGeoCode(undefined);
  }, [metric]);

  // const [ref, size] = useSize<HTMLDivElement>();

  return (
    <div /* ref={ref} */ style={{ width: "100%", height: "70vh" }}>
      {/* Controls */}
      <div
        style={{
          marginBottom: 8,
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        <div>
          <label>
            Metric:&nbsp;
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as MetricMode)}
            >
              <option value="global">Global</option>
              <option value="country">Country</option>
              <option value="state_us">US State</option>
            </select>
          </label>
          {metric !== "global" && (
            <label style={{ marginLeft: 12 }}>
              Code:&nbsp;
              <input
                placeholder={
                  metric === "country" ? "e.g. US, CA, TT" : "e.g. NY, CA, TX"
                }
                value={geoCode ?? ""}
                onChange={(e) =>
                  setGeoCode(e.target.value.trim().toUpperCase())
                }
                style={{ width: 120 }}
              />
            </label>
          )}
        </div>
        <div style={{ marginLeft: "auto", opacity: 0.7 }}>
          {metric !== "global" && geoCode ? `• ${geoCode}` : ""}
        </div>
      </div>

      <TreeMap
        key={key}
        raw={raw}
        metric={metric}
        geoCode={geoCode}
        // measuredWidth={size.width}
        // measuredHeight={size.height}
        // startLevel={2}
      />
    </div>
  );
}

// import React, { useEffect, useState } from "react";
// import TreeMap from "./TreeMap";
// import { type RawHierarchy, type MetricMode } from "./transform";
// // import { useSize } from "@/hooks/useSize";

// export default function TreemapContainer({ raw }: { raw: RawHierarchy }) {
//   const [metric, setMetric] = useState<MetricMode>("global");
//   const [geoCode, setGeoCode] = useState<string | undefined>(undefined);

//   // Force a fresh mount when metric/geo changes (keeps D3 island simple & robust)
//   const key = `${metric}:${geoCode ?? ""}`;

//   // const [ref, size] = useSize<HTMLDivElement>();

//   // Optional: keep code uppercase for country/state
//   useEffect(() => {
//     if (metric === "global") setGeoCode(undefined);
//   }, [metric]);

//   return (
//     <div /* ref={ref} */ style={{ width: "100%", height: "70vh" }}>
//       {/* Controls */}
//       <div
//         style={{
//           marginBottom: 8,
//           display: "flex",
//           gap: 12,
//           alignItems: "center",
//         }}
//       >
//         <div>
//           <label>
//             Metric:&nbsp;
//             <select
//               value={metric}
//               onChange={(e) => setMetric(e.target.value as MetricMode)}
//             >
//               <option value="global">Global</option>
//               <option value="country">Country</option>
//               <option value="state_us">US State</option>
//             </select>
//           </label>
//           {metric !== "global" && (
//             <label style={{ marginLeft: 12 }}>
//               Code:&nbsp;
//               <input
//                 placeholder={
//                   metric === "country" ? "e.g. US, CA, TT" : "e.g. NY, CA, TX"
//                 }
//                 value={geoCode ?? ""}
//                 onChange={(e) =>
//                   setGeoCode(e.target.value.trim().toUpperCase())
//                 }
//                 style={{ width: 120 }}
//               />
//             </label>
//           )}
//         </div>

//         <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
//           <span style={{ opacity: 0.7 }}>
//             {metric !== "global" && geoCode ? `• ${geoCode}` : ""}
//           </span>
//         </div>
//       </div>

//       <TreeMap
//         key={key}
//         raw={raw}
//         metric={metric}
//         geoCode={geoCode}
//         // measuredWidth={size.width}
//         // measuredHeight={size.height}
//         // startLevel={2}
//       />
//     </div>
//   );
// }

// // import React, { useEffect, useMemo, useState } from "react";
// // import TreeMapD3 from "./ZoomableTreemap"; // <-- filename above
// // import {
// //   type RawHierarchy,
// //   type RawNode,
// //   type MetricMode,
// //   projectLevel,
// //   makeSyntheticRoot,
// // } from "./transform";
// // // import { useSize } from "@/hooks/useSize";

// // export default function TreemapContainer({ raw }: { raw: RawHierarchy }) {
// //   const [metric, setMetric] = useState<MetricMode>("global");
// //   const [geoCode, setGeoCode] = useState<string | undefined>(undefined);

// //   // Navigation: stack of branches; top = current branch
// //   const syntheticRoot = useMemo(() => makeSyntheticRoot(raw), [raw]);
// //   const [stack, setStack] = useState<RawNode[]>([syntheticRoot]);
// //   const [level, setLevel] = useState<number>(2); // 2 → 1 → 0

// //   // Reset to top on metric/geo change
// //   useEffect(() => {
// //     setStack([syntheticRoot]);
// //     setLevel(2);
// //   }, [metric, geoCode, syntheticRoot]);

// //   const currentBranch = stack[stack.length - 1];

// //   // Build one-level tree for current view
// //   const currentTree = useMemo(
// //     () => projectLevel(currentBranch, level, metric, geoCode),
// //     [currentBranch, level, metric, geoCode]
// //   );

// //   // Next-level builder for the D3 component
// //   const getNextLevelTree = (rawNode: RawNode) => {
// //     if (level <= 0) return null;
// //     return projectLevel(rawNode, level - 1, metric, geoCode);
// //   };

// //   const handleDrillDown = (rawNode: RawNode) => {
// //     if (level <= 0) return;
// //     setStack((s) => [...s, rawNode]);
// //     setLevel((lv) => lv - 1);
// //   };

// //   const handleZoomOut = () => {
// //     if (stack.length <= 1) return; // already at top
// //     setStack((s) => s.slice(0, -1));
// //     setLevel((lv) => Math.min(2, lv + 1));
// //   };

// //   // const [ref, size] = useSize<HTMLDivElement>();

// //   return (
// //     <div /* ref={ref} */ style={{ width: "100%", height: "70vh" }}>
// //       {/* Controls */}
// //       <div
// //         style={{
// //           marginBottom: 8,
// //           display: "flex",
// //           gap: 12,
// //           alignItems: "center",
// //         }}
// //       >
// //         <div>
// //           <label>
// //             Metric:&nbsp;
// //             <select
// //               value={metric}
// //               onChange={(e) => {
// //                 const m = e.target.value as MetricMode;
// //                 setMetric(m);
// //                 if (m === "global") setGeoCode(undefined);
// //               }}
// //             >
// //               <option value="global">Global</option>
// //               <option value="country">Country</option>
// //               <option value="state_us">US State</option>
// //             </select>
// //           </label>
// //           {metric !== "global" && (
// //             <label style={{ marginLeft: 12 }}>
// //               Code:&nbsp;
// //               <input
// //                 placeholder={
// //                   metric === "country" ? "e.g. US, CA, TT" : "e.g. NY, CA, TX"
// //                 }
// //                 value={geoCode ?? ""}
// //                 onChange={(e) =>
// //                   setGeoCode(e.target.value.trim().toUpperCase())
// //                 }
// //                 style={{ width: 120 }}
// //               />
// //             </label>
// //           )}
// //         </div>

// //         <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
// //           <button
// //             onClick={handleZoomOut}
// //             disabled={stack.length <= 1}
// //             title="Go up one level"
// //           >
// //             ← Back
// //           </button>
// //           <span style={{ opacity: 0.7 }}>
// //             Level: {level}
// //             {metric !== "global" && geoCode ? ` • ${geoCode}` : ""}
// //           </span>
// //         </div>
// //       </div>

// //       <TreeMapD3
// //         data={currentTree}
// //         getNextLevelTree={getNextLevelTree}
// //         onDrillDown={handleDrillDown}
// //         onZoomOut={handleZoomOut}
// //         // measuredWidth={size.width}
// //         // measuredHeight={size.height}
// //       />
// //     </div>
// //   );
// // }

// // // import React, { useEffect, useMemo, useState } from "react";
// // // import ZoomableTreemap from "./ZoomableTreemap";
// // // import {
// // //   type RawHierarchy,
// // //   type RawNode,
// // //   type MetricMode,
// // //   projectLevel,
// // //   makeSyntheticRoot,
// // // } from "./transform";
// // // // import { useSize } from "@/hooks/useSize";

// // // export default function TreemapContainer({ raw }: { raw: RawHierarchy }) {
// // //   // Metric selection
// // //   const [metric, setMetric] = useState<MetricMode>("global");
// // //   const [geoCode, setGeoCode] = useState<string | undefined>(undefined);

// // //   // Navigation: stack of branches; top = current branch
// // //   const rootRaw = useMemo(() => makeSyntheticRoot(raw), [raw]);
// // //   const [stack, setStack] = useState<RawNode[]>([rootRaw]); // synthetic root at depth -1
// // //   const [level, setLevel] = useState<number>(2); // 2 → 1 → 0

// // //   // Reset to top when metric/geo changes
// // //   useEffect(() => {
// // //     setStack([rootRaw]);
// // //     setLevel(2);
// // //   }, [metric, geoCode, rootRaw]);

// // //   const currentBranch = stack[stack.length - 1];

// // //   // One-level projection for current view
// // //   const projected = useMemo(
// // //     () => projectLevel(currentBranch, level, metric, geoCode),
// // //     [currentBranch, level, metric, geoCode]
// // //   );

// // //   // Build next level’s one-level tree from a clicked raw node
// // //   const getNextLevelTree = (rawNode: RawNode) => {
// // //     if (level <= 0) return null;
// // //     return projectLevel(rawNode, level - 1, metric, geoCode);
// // //   };

// // //   // After zoom-in completes
// // //   const handleDrillDown = (nextRaw: RawNode /*, clickedRect: Rect*/) => {
// // //     if (level <= 0) return;
// // //     setStack((s) => [...s, nextRaw]);
// // //     setLevel((lv) => lv - 1);
// // //     // Note: we do NOT reset any view here; TreeMap keeps the zoom level
// // //   };

// // //   // After zoom-out completes
// // //   const handleZoomOut = () => {
// // //     if (stack.length <= 1) return; // already at top
// // //     setStack((s) => s.slice(0, -1));
// // //     setLevel((lv) => Math.min(2, lv + 1));
// // //     // No view reset here either; TreeMap handles the zoom animation
// // //   };

// // //   // const [ref, size] = useSize<HTMLDivElement>();

// // //   return (
// // //     <div /* ref={ref} */ style={{ width: "100%", height: "70vh" }}>
// // //       {/* Controls */}
// // //       <div
// // //         style={{
// // //           marginBottom: 8,
// // //           display: "flex",
// // //           gap: 12,
// // //           alignItems: "center",
// // //         }}
// // //       >
// // //         <div>
// // //           <label>
// // //             Metric:&nbsp;
// // //             <select
// // //               value={metric}
// // //               onChange={(e) => {
// // //                 const m = e.target.value as MetricMode;
// // //                 setMetric(m);
// // //                 if (m === "global") setGeoCode(undefined);
// // //               }}
// // //             >
// // //               <option value="global">Global</option>
// // //               <option value="country">Country</option>
// // //               <option value="state_us">US State</option>
// // //             </select>
// // //           </label>
// // //           {metric !== "global" && (
// // //             <label style={{ marginLeft: 12 }}>
// // //               Code:&nbsp;
// // //               <input
// // //                 placeholder={
// // //                   metric === "country" ? "e.g. US, CA, TT" : "e.g. NY, CA, TX"
// // //                 }
// // //                 value={geoCode ?? ""}
// // //                 onChange={(e) =>
// // //                   setGeoCode(e.target.value.trim().toUpperCase())
// // //                 }
// // //                 style={{ width: 120 }}
// // //               />
// // //             </label>
// // //           )}
// // //         </div>

// // //         <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
// // //           <button
// // //             onClick={handleZoomOut}
// // //             disabled={stack.length <= 1}
// // //             title="Go up one level"
// // //           >
// // //             ← Back
// // //           </button>
// // //           <span style={{ opacity: 0.7 }}>
// // //             Level: {level}
// // //             {metric !== "global" && geoCode ? ` • ${geoCode}` : ""}
// // //           </span>
// // //         </div>
// // //       </div>

// // //       <ZoomableTreemap
// // //         data={projected}
// // //         // measuredWidth={size.width}
// // //         // measuredHeight={size.height}
// // //         drillEnabled={level > 0}
// // //         onDrillDown={(rawNode, _rect) => handleDrillDown(rawNode)}
// // //         onZoomOut={handleZoomOut}
// // //         getNextLevelTree={getNextLevelTree}
// // //       />
// // //     </div>
// // //   );
// // // }

// // // // import React, { useEffect, useMemo, useState } from "react";
// // // // import ZoomableTreemap from "./ZoomableTreemap";
// // // // import {
// // // //   type RawHierarchy,
// // // //   type RawNode,
// // // //   type MetricMode,
// // // //   projectLevel,
// // // //   makeSyntheticRoot,
// // // // } from "./transform";
// // // // // import { useSize } from "@/hooks/useSize";

// // // // export default function TreemapContainer({ raw }: { raw: RawHierarchy }) {
// // // //   // Metric selection
// // // //   const [metric, setMetric] = useState<MetricMode>("global"); // "global" | "country" | "state_us"
// // // //   const [geoCode, setGeoCode] = useState<string | undefined>(undefined); // e.g., "US" or "CA" or "NY"

// // // //   // Navigation state: we keep a stack of branches for breadcrumb-like behavior
// // // //   const rootRaw = useMemo(() => makeSyntheticRoot(raw), [raw]);
// // // //   const [stack, setStack] = useState<RawNode[]>([rootRaw]); // top of stack = current branch
// // // //   const [level, setLevel] = useState<number>(2); // start at 2 → then 1 → then 0

// // // //   // If metric/geo changes, reset to the top-level global view
// // // //   useEffect(() => {
// // // //     setStack([rootRaw]);
// // // //     setLevel(2);
// // // //   }, [metric, geoCode, rootRaw]);

// // // //   const currentBranch = stack[stack.length - 1];

// // // //   // Build the one-level projection for the current view
// // // //   const projected = useMemo(
// // // //     () => projectLevel(currentBranch, level, metric, geoCode),
// // // //     [currentBranch, level, metric, geoCode]
// // // //   );

// // // //   // Drilldown handler (called by the chart after the zoom-in animation)
// // // //   const handleDrillDown = (nextRaw: RawNode) => {
// // // //     if (level <= 0) return; // already at deepest level
// // // //     setStack((s) => [...s, nextRaw]);
// // // //     setLevel((lv) => lv - 1);
// // // //   };

// // // //   // Zoom-out handler (background click)
// // // //   const handleZoomOut = () => {
// // // //     if (stack.length <= 1) return; // already at root
// // // //     setStack((s) => s.slice(0, -1));
// // // //     setLevel((lv) => Math.min(2, lv + 1));
// // // //   };

// // // //   // const [ref, size] = useSize<HTMLDivElement>();

// // // //   return (
// // // //     <div /* ref={ref} */ style={{ width: "100%", height: "70vh" }}>
// // // //       {/* Controls */}
// // // //       <div
// // // //         style={{
// // // //           marginBottom: 8,
// // // //           display: "flex",
// // // //           gap: 12,
// // // //           alignItems: "center",
// // // //         }}
// // // //       >
// // // //         <div>
// // // //           <label>
// // // //             Metric:&nbsp;
// // // //             <select
// // // //               value={metric}
// // // //               onChange={(e) => {
// // // //                 const m = e.target.value as MetricMode;
// // // //                 setMetric(m);
// // // //                 if (m === "global") setGeoCode(undefined);
// // // //               }}
// // // //             >
// // // //               <option value="global">Global</option>
// // // //               <option value="country">Country</option>
// // // //               <option value="state_us">US State</option>
// // // //             </select>
// // // //           </label>
// // // //           {metric !== "global" && (
// // // //             <label style={{ marginLeft: 12 }}>
// // // //               Code:&nbsp;
// // // //               <input
// // // //                 placeholder={
// // // //                   metric === "country" ? "e.g. US, CA, TT" : "e.g. NY, CA, TX"
// // // //                 }
// // // //                 value={geoCode ?? ""}
// // // //                 onChange={(e) =>
// // // //                   setGeoCode(e.target.value.trim().toUpperCase())
// // // //                 }
// // // //                 style={{ width: 120 }}
// // // //               />
// // // //             </label>
// // // //           )}
// // // //         </div>

// // // //         <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
// // // //           <button
// // // //             onClick={handleZoomOut}
// // // //             disabled={stack.length <= 1}
// // // //             title="Go up one level"
// // // //           >
// // // //             ← Back
// // // //           </button>
// // // //           <span style={{ opacity: 0.7 }}>
// // // //             Level: {level}{" "}
// // // //             {metric !== "global" && geoCode ? `• ${geoCode}` : ""}
// // // //           </span>
// // // //         </div>
// // // //       </div>

// // // //       <ZoomableTreemap
// // // //         data={projected}
// // // //         // measuredWidth={size.width}
// // // //         // measuredHeight={size.height}
// // // //         onDrillDown={handleDrillDown}
// // // //         onZoomOut={handleZoomOut}
// // // //         drillEnabled={level > 0}
// // // //       />
// // // //     </div>
// // // //   );
// // // // }

// // // // // // Example wiring
// // // // // import React, { useMemo, useState } from "react";
// // // // // import ZoomableTreemap from "./ZoomableTreemap";
// // // // // import { toTree, type RawHierarchy, type MetricMode } from "./transform";
// // // // // // import { useSize } from "@/hooks/useSize";

// // // // // export default function TreemapContainer({ raw }: { raw: RawHierarchy }) {
// // // // //   const [metric, setMetric] = useState<MetricMode>("global"); // "global" | "country" | "state_us"
// // // // //   const [geoCode, setGeoCode] = useState<string | undefined>(undefined); // e.g., "US" or "CA" or "NY"

// // // // //   const treeData = useMemo(
// // // // //     () => toTree(raw, { metric, geoCode }),
// // // // //     [raw, metric, geoCode]
// // // // //   );

// // // // //   // const [ref, size] = useSize<HTMLDivElement>();

// // // // //   return (
// // // // //     <div style={{ width: "100%", height: "70vh" /* }} ref={ref} */ }}>
// // // // //       {/* Controls (example) */}
// // // // //       <div style={{ marginBottom: 8 }}>
// // // // //         <label>
// // // // //           Metric:&nbsp;
// // // // //           <select
// // // // //             value={metric}
// // // // //             onChange={(e) => {
// // // // //               const m = e.target.value as MetricMode;
// // // // //               setMetric(m);
// // // // //               // Reset geo when switching back to global
// // // // //               if (m === "global") setGeoCode(undefined);
// // // // //             }}
// // // // //           >
// // // // //             <option value="global">Global</option>
// // // // //             <option value="country">Country</option>
// // // // //             <option value="state_us">US State</option>
// // // // //           </select>
// // // // //         </label>
// // // // //         {metric !== "global" && (
// // // // //           <label style={{ marginLeft: 12 }}>
// // // // //             Code:&nbsp;
// // // // //             <input
// // // // //               placeholder={
// // // // //                 metric === "country" ? "e.g. US, CA, TT" : "e.g. NY, CA, TX"
// // // // //               }
// // // // //               value={geoCode ?? ""}
// // // // //               onChange={(e) => setGeoCode(e.target.value.trim().toUpperCase())}
// // // // //               style={{ width: 120 }}
// // // // //             />
// // // // //           </label>
// // // // //         )}
// // // // //       </div>

// // // // //       <ZoomableTreemap
// // // // //         data={treeData}
// // // // //         // measuredWidth={size.width}
// // // // //         // measuredHeight={size.height}
// // // // //       />
// // // // //     </div>
// // // // //   );
// // // // // }
