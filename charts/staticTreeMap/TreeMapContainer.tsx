import React, { useEffect, useState } from "react";
import TreemapMVP from "./TreemapMVP";
import { type RawHierarchy, type MetricMode } from "./transform";

export default function TreemapContainer({ raw }: { raw: RawHierarchy }) {
  const [metric, setMetric] = useState<MetricMode>("global");
  const [geoCode, setGeoCode] = useState<string | undefined>(undefined);

  // reset geoCode when switching back to global
  useEffect(() => {
    if (metric === "global") setGeoCode(undefined);
  }, [metric]);

  return (
    <div style={{ width: "100%", height: "70vh" }}>
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

      <TreemapMVP
        data={raw}
        metric={metric}
        geoCode={geoCode}
        initialLevel={0}
      />
    </div>
  );
}

// // MINIMUM USAGE:
// import TreemapMVP from "./TreemapMVP";

// export default function Panel({ raw }: { raw: RawHierarchy }) {
//   return (
//     <div style={{ height: 700 }}>
//       <TreemapMVP
//         data={raw}
//         metric="global" // "global" | "country" | "state_us"
//         geoCode="USA" // required for "country" or "state_us"
//         initialLevel={0} // start at level 0 across the whole hierarchy
//       />
//     </div>
//   );
// }
