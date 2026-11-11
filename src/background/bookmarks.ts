import { api } from "../shared/api";
import type { BNode, NodeKind, RootRole } from "../shared/types";

type RawNode = chrome.bookmarks.BookmarkTreeNode & {
  type?: "bookmark" | "folder" | "separator"; // Firefox
  folderType?: string; // Chrome 134+
};

const ROLE_BY_ID: Record<string, RootRole> = {
  // Chrome
  "1": "toolbar",
  "2": "other",
  "3": "mobile",
  // Firefox
  toolbar_____: "toolbar",
  menu________: "menu",
  unfiled_____: "other",
  mobile______: "mobile",
};

const ROLE_BY_FOLDER_TYPE: Record<string, RootRole> = {
  "bookmarks-bar": "toolbar",
  other: "other",
  mobile: "mobile",
};

export async function getTree(): Promise<BNode[]> {
  const [root] = (await api.bookmarks.getTree()) as RawNode[];
  return (root?.children ?? [])
    .map((n) => normalize(n, true))
    .filter((n) => !(n.role === "mobile" && (n.children?.length ?? 0) === 0));
}

export function normalize(raw: RawNode, topLevel = false): BNode {
  const kind = kindOf(raw);
  const node: BNode = { id: raw.id, title: raw.title, kind };
  if (raw.parentId !== undefined) node.parentId = raw.parentId;
  if (kind === "bookmark" && raw.url !== undefined) node.url = raw.url;
  if (kind === "folder") {
    node.children = (raw.children ?? []).map((c) => normalize(c));
    if (topLevel) {
      const role = (raw.folderType && ROLE_BY_FOLDER_TYPE[raw.folderType]) ?? ROLE_BY_ID[raw.id];
      if (role) node.role = role;
    }
  }
  return node;
}

function kindOf(raw: RawNode): NodeKind {
  if (raw.type) return raw.type;
  return raw.url === undefined ? "folder" : "bookmark";
}
