// Example wiring
import React, { useMemo, useState } from "react";
import ZoomableTreemap from "./ZoomableTreemap";
import { toTree, type RawHierarchy, type MetricMode } from "./transform";
// import { useSize } from "@/hooks/useSize";

export default function TreemapContainer({ raw }: { raw: RawHierarchy }) {
  const [metric, setMetric] = useState<MetricMode>("global"); // "global" | "country" | "state_us"
  const [geoCode, setGeoCode] = useState<string | undefined>(undefined); // e.g., "US" or "CA" or "NY"

  const treeData = useMemo(
    () => toTree(raw, { metric, geoCode }),
    [raw, metric, geoCode]
  );

  // const [ref, size] = useSize<HTMLDivElement>();

  return (
    <div style={{ width: "100%", height: "70vh" /* }} ref={ref} */ }}>
      {/* Controls (example) */}
      <div style={{ marginBottom: 8 }}>
        <label>
          Metric:&nbsp;
          <select
            value={metric}
            onChange={(e) => {
              const m = e.target.value as MetricMode;
              setMetric(m);
              // Reset geo when switching back to global
              if (m === "global") setGeoCode(undefined);
            }}
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
              onChange={(e) => setGeoCode(e.target.value.trim().toUpperCase())}
              style={{ width: 120 }}
            />
          </label>
        )}
      </div>

      <ZoomableTreemap
        data={treeData}
        // measuredWidth={size.width}
        // measuredHeight={size.height}
      />
    </div>
  );
}
