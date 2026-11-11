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
  children?: BNode[];
}
