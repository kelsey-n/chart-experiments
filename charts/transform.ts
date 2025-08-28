// Your raw node shape
export type RawNode = {
  level: 0 | 1 | 2;
  cluster_name: string;
  cluster_description?: string;
  variable?: {
    count?: {
      country?: Record<string, number>;
      global?: { GLOBAL?: number };
      state_us?: Record<string, number>;
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
  level: 0 | 1 | 2;
  value?: number; // used on leaves by d3.sum; internal nodes will be summed
  children?: TreeNode[];
  // Keep a reference to the raw node if you ever need it in tooltips/click handlers
  __raw?: RawNode;
};

// Helper: safely read value from your variable structure
function extractValue(
  raw?: RawNode,
  metric: MetricMode = "global",
  geoCode?: string
): number {
  const counts = raw?.variable?.count ?? {};
  if (metric === "global") {
    return (counts.global?.GLOBAL ?? 0) as number;
  }
  if (metric === "country" && geoCode) {
    return (counts.country?.[geoCode] ?? 0) as number;
  }
  if (metric === "state_us" && geoCode) {
    return (counts.state_us?.[geoCode] ?? 0) as number;
  }
  return 0;
}

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
      // Give every node a value. Treemap will sum children, but having a value on
      // internal nodes helps if they occasionally behave like leaves.
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
