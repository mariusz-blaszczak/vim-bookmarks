import type { BNode } from "../shared/types";

export interface Row {
  node: BNode;
  depth: number;
  /** Only meaningful for folders. */
  open: boolean;
}

export function flatten(roots: readonly BNode[], expanded: ReadonlySet<string>): Row[] {
  const rows: Row[] = [];
  const walk = (nodes: readonly BNode[], depth: number): void => {
    for (const node of nodes) {
      const open = node.kind === "folder" && expanded.has(node.id);
      rows.push({ node, depth, open });
      if (open && node.children) walk(node.children, depth + 1);
    }
  };
  walk(roots, 0);
  return rows;
}

export interface TreeIndex {
  node(id: string): BNode | undefined;
  /** Ancestors from the top level down to and including `id`. */
  path(id: string): BNode[];
  folderIds(): string[];
}

export function indexTree(roots: readonly BNode[]): TreeIndex {
  const nodes = new Map<string, BNode>();
  const parents = new Map<string, string>();
  const walk = (list: readonly BNode[], parent?: string): void => {
    for (const n of list) {
      nodes.set(n.id, n);
      if (parent !== undefined) parents.set(n.id, parent);
      if (n.children) walk(n.children, n.id);
    }
  };
  walk(roots);

  return {
    node: (id) => nodes.get(id),
    path(id) {
      const out: BNode[] = [];
      for (let cur: string | undefined = id; cur !== undefined; cur = parents.get(cur)) {
        const n = nodes.get(cur);
        if (!n) break;
        out.unshift(n);
      }
      return out;
    },
    folderIds: () => [...nodes.values()].filter((n) => n.kind === "folder").map((n) => n.id),
  };
}

/** Index of the row's parent folder row, or -1 for top-level rows. */
export function parentRow(rows: readonly Row[], i: number): number {
  const depth = rows[i]?.depth ?? 0;
  for (let j = i - 1; j >= 0; j--) {
    if (rows[j]!.depth < depth) return j;
  }
  return -1;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
