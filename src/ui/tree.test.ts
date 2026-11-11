import { describe, expect, it } from "vitest";
import type { BNode } from "../shared/types";
import { flatten, indexTree, parentRow } from "./tree";

const bm = (id: string, title = id): BNode => ({ id, title, kind: "bookmark", url: `https://${id}.test/` });
const folder = (id: string, children: BNode[], title = id): BNode => ({ id, title, kind: "folder", children });

export const sample: BNode[] = [
  folder("bar", [bm("gh"), folder("dev", [bm("mdn"), bm("rust")]), bm("news")]),
  folder("other", [bm("misc")]),
];

const ids = (rows: { node: BNode }[]) => rows.map((r) => r.node.id);

describe("flatten", () => {
  it("shows only top level when nothing is expanded", () => {
    expect(ids(flatten(sample, new Set()))).toEqual(["bar", "other"]);
  });

  it("descends into expanded folders with depth", () => {
    const rows = flatten(sample, new Set(["bar", "dev"]));
    expect(ids(rows)).toEqual(["bar", "gh", "dev", "mdn", "rust", "news", "other"]);
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 1, 2, 2, 1, 0]);
    expect(rows.find((r) => r.node.id === "dev")?.open).toBe(true);
    expect(rows.find((r) => r.node.id === "other")?.open).toBe(false);
  });

  it("hides children of an expanded folder inside a collapsed one", () => {
    expect(ids(flatten(sample, new Set(["dev"])))).toEqual(["bar", "other"]);
  });
});

describe("parentRow", () => {
  const rows = flatten(sample, new Set(["bar", "dev"]));
  it("finds the enclosing folder row", () => {
    expect(parentRow(rows, 3)).toBe(2); // mdn → dev
    expect(parentRow(rows, 5)).toBe(0); // news → bar
    expect(parentRow(rows, 6)).toBe(-1); // other is top level
  });
});

describe("indexTree", () => {
  const index = indexTree(sample);
  it("returns the path from the top level down", () => {
    expect(index.path("rust").map((n) => n.id)).toEqual(["bar", "dev", "rust"]);
    expect(index.path("missing")).toEqual([]);
  });

  it("lists folder ids", () => {
    expect(index.folderIds().sort()).toEqual(["bar", "dev", "other"]);
  });
});
