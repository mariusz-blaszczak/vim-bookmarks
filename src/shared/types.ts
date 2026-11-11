export type NodeKind = "folder" | "bookmark" | "separator";

/** Built-in top-level folders, normalized across Chrome and Firefox. */
export type RootRole = "toolbar" | "menu" | "other" | "mobile";

export interface BNode {
  id: string;
  parentId?: string;
  title: string;
  kind: NodeKind;
  url?: string;
  role?: RootRole;
  /** Managed/enterprise bookmarks (Chrome) that cannot be modified. */
  locked?: boolean;
  children?: BNode[];
}

/** Where to insert: inside `parentId`, right after sibling `afterId` (null = first). */
export interface Target {
  parentId: string;
  afterId: string | null;
}

export interface PageInfo {
  url: string;
  title: string;
}
