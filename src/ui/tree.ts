import type { BNode, Target } from "../shared/types";

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
  /** Parent folder, or undefined for top-level folders. */
  parent(id: string): BNode | undefined;
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
    parent: (id) => {
      const p = parents.get(id);
      return p === undefined ? undefined : nodes.get(p);
    },
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

/** Built-in top-level folders and managed bookmarks can't be changed. */
export function isProtected(index: TreeIndex, id: string): boolean {
  return index.parent(id) === undefined || index.path(id).some((n) => n.locked);
}

export function countDescendants(node: BNode): number {
  return (node.children ?? []).reduce((n, c) => n + 1 + countDescendants(c), 0);
}

/**
 * Where new or pasted items go relative to the cursor row, so they appear
 * right below ("after") or above ("before") it:
 *  - after an open folder → its first child
 *  - on a top-level folder → inside it (top level itself is fixed)
 *  - otherwise → sibling of the cursor node
 */
export function insertTarget(row: Row, index: TreeIndex, where: "after" | "before"): Target {
  const { node } = row;
  if (node.kind === "folder" && where === "after" && row.open) {
    return { parentId: node.id, afterId: null };
  }
  const parent = index.parent(node.id);
  if (!parent) {
    const last = node.children?.at(-1);
    return { parentId: node.id, afterId: where === "after" && last ? last.id : null };
  }
  if (where === "after") return { parentId: parent.id, afterId: node.id };
  const siblings = parent.children ?? [];
  const i = siblings.findIndex((s) => s.id === node.id);
  return { parentId: parent.id, afterId: i > 0 ? siblings[i - 1]!.id : null };
}
