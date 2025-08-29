// Your raw node shape
export type RawNode = {
  level: number; // 0 | 1 | 2 in practice, but allow number as you requested
  cluster_name: string;
  cluster_description?: string;
  variable?: {
    count?: {
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

// Value selection mode
export type MetricMode = "global" | "country" | "state_us";

// Unified node used by the treemap component
export type TreeNode = {
  name: string;
  desc?: string;
  level: number;
  value?: number; // used by d3.sum in a one-level projection
  children?: TreeNode[];
  __raw?: RawNode; // keep reference to raw node for drilldown
};

// --- Existing helper (kept) -----------------------------------------------
// Helper: safely read value from your variable structure
export function extractValue(
  raw?: RawNode,
  metric: MetricMode = "global",
  geoCode?: string
): number {
  const counts = raw?.variable?.count ?? {};
  if (metric === "global") {
    const v = counts.global?.GLOBAL;
    return Number.isFinite(v) ? (v as number) : 0;
  }
  if (metric === "country" && geoCode) {
    const v = counts.country?.[geoCode];
    return Number.isFinite(v) ? (v as number) : 0;
  }
  if (metric === "state_us" && geoCode) {
    const v = counts.state_us?.[geoCode];
    return Number.isFinite(v) ? (v as number) : 0;
  }
  return 0;
}

// --- Existing builder (kept for compatibility, not used by the new view) --
export function toTree(
  rawRoot: RawHierarchy,
  options: { metric: MetricMode; geoCode?: string }
): TreeNode {
  const { metric, geoCode } = options;

  const mapNode = (rn: RawNode): TreeNode => {
    const node: TreeNode = {
      name: rn.cluster_name,
      desc: rn.cluster_description,
      level: rn.level,
      // Note: keeping a value here for compatibility, but our treemap will not
      // use parent+children simultaneously; we project one level at a time.
      value: extractValue(rn, metric, geoCode),
      __raw: rn,
    };
    if (rn.children && rn.children.length > 0) {
      node.children = rn.children.map(mapNode);
    }
    return node;
  };

  return {
    name: "root",
    level: 2,
    children: (rawRoot.request_hierarchy || []).map(mapNode),
  };
}

// --- New helpers for one-level projection ---------------------------------

/** Build a synthetic RawNode that wraps the entire hierarchy as its children. */
export function makeSyntheticRoot(h: RawHierarchy): RawNode {
  return {
    level: 3, // synthetic level above 2
    cluster_name: "root",
    cluster_description: "Synthetic root",
    children: h.request_hierarchy ?? [],
  };
}

/** Collect all RawNodes under `subtree` that have the given `level`. */
export function collectAtLevel(
  subtree: RawNode,
  level: number,
  out: RawNode[] = []
): RawNode[] {
  if (subtree.level === level) out.push(subtree);
  subtree.children?.forEach((ch) => collectAtLevel(ch, level, out));
  return out;
}

/**
 * Project a single "view" that contains only nodes at `level` within `subtree`.
 * Each child gets its own per-level value (no resumming). Zero/missing filtered out.
 */
export function projectLevel(
  subtree: RawNode,
  level: number,
  metric: MetricMode,
  geoCode?: string
): TreeNode {
  const kids: TreeNode[] = collectAtLevel(subtree, level).map((rn) => {
    const val = extractValue(rn, metric, geoCode);
    return {
      name: rn.cluster_name,
      desc: rn.cluster_description,
      level: rn.level,
      value: val,
      __raw: rn,
    };
  });

  // Filter zeros/missing so they don't consume space
  const filtered = kids.filter(
    (k) => Number.isFinite(k.value) && (k.value as number) > 0
  );

  return { name: `level-${level}`, level, children: filtered };
}
