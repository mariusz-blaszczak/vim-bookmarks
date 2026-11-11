import { describe, expect, it } from "vitest";
import type { BNode } from "../shared/types";
import { sample } from "./test-fixtures";
import { countDescendants, flatten, indexTree, insertTarget, isProtected, parentRow } from "./tree";

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

describe("insertTarget", () => {
  const index = indexTree(sample);
  const rows = flatten(sample, new Set(["bar", "dev"]));
  const row = (id: string) => rows.find((r) => r.node.id === id)!;

  it("puts items next to a bookmark", () => {
    expect(insertTarget(row("news"), index, "after")).toEqual({ parentId: "bar", afterId: "news" });
    expect(insertTarget(row("dev"), index, "before")).toEqual({ parentId: "bar", afterId: "gh" });
    expect(insertTarget(row("gh"), index, "before")).toEqual({ parentId: "bar", afterId: null });
  });

  it("puts items first inside an open folder when pasting after it", () => {
    expect(insertTarget(row("dev"), index, "after")).toEqual({ parentId: "dev", afterId: null });
  });

  it("puts items inside top-level folders (first or last)", () => {
    const closed = flatten(sample, new Set()).find((r) => r.node.id === "other")!;
    expect(insertTarget(closed, index, "after")).toEqual({ parentId: "other", afterId: "misc" });
    expect(insertTarget(closed, index, "before")).toEqual({ parentId: "other", afterId: null });
    expect(insertTarget(row("bar"), index, "after")).toEqual({ parentId: "bar", afterId: null });
  });
});

describe("isProtected / countDescendants", () => {
  const index = indexTree([...sample, { id: "m", title: "managed", kind: "folder", locked: true, children: [{ id: "mb", title: "x", kind: "bookmark", url: "https://x/" }] }]);
  it("protects top-level folders and anything managed", () => {
    expect(isProtected(index, "bar")).toBe(true);
    expect(isProtected(index, "mb")).toBe(true);
    expect(isProtected(index, "dev")).toBe(false);
  });
  it("counts all nested items", () => {
    expect(countDescendants(sample[0]!)).toBe(5);
  });
});
