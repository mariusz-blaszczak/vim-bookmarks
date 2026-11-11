import { describe, expect, it } from "vitest";
import type { OpenWhere } from "../shared/protocol";
import { ACTIONS, type Ctx } from "./actions";
import { sample } from "./tree.test";
import { clamp, flatten, indexTree, type Row } from "./tree";

/** Minimal in-memory Ctx mirroring the app's behaviour. */
function makeCtx(expandedIds: string[], cursorId: string) {
  let expanded = new Set(expandedIds);
  let rows: Row[] = flatten(sample, expanded);
  let cursor = rows.findIndex((r) => r.node.id === cursorId);
  const opened: OpenWhere[] = [];
  const messages: string[] = [];
  let closed = false;
  const refresh = (keep = rows[cursor]?.node.id) => {
    rows = flatten(sample, expanded);
    const i = rows.findIndex((r) => r.node.id === keep);
    cursor = i >= 0 ? i : clamp(cursor, 0, rows.length - 1);
  };
  const ctx: Ctx = {
    get rows() { return rows; },
    get cursor() { return cursor; },
    pageSize: 4,
    setCursor: (i) => { cursor = clamp(i, 0, rows.length - 1); },
    setExpanded: (id, open) => { if (open) expanded.add(id); else expanded.delete(id); refresh(); },
    expandAll: () => { expanded = new Set(indexTree(sample).folderIds()); refresh(); },
    collapseAll: () => { const top = indexTree(sample).path(rows[cursor]!.node.id)[0]?.id; expanded.clear(); refresh(top); },
    open: (w) => opened.push(w),
    close: () => { closed = true; },
    message: (t) => messages.push(t),
  };
  const run = (action: string, count: number | null = null) => ACTIONS[action]!(ctx, count);
  const at = () => rows[cursor]?.node.id;
  return { ctx, run, at, opened, messages, isClosed: () => closed, expanded: () => expanded };
}

describe("actions", () => {
  it("moves with counts and clamps", () => {
    const t = makeCtx(["bar", "dev"], "bar");
    t.run("cursor.down", 3);
    expect(t.at()).toBe("mdn");
    t.run("cursor.down", 99);
    expect(t.at()).toBe("other");
    t.run("cursor.first", 2);
    expect(t.at()).toBe("gh");
    t.run("cursor.last");
    expect(t.at()).toBe("other");
  });

  it("h collapses an open folder, otherwise jumps to the parent", () => {
    const t = makeCtx(["bar", "dev"], "rust");
    t.run("fold.close");
    expect(t.at()).toBe("dev");
    t.run("fold.close");
    expect(t.expanded().has("dev")).toBe(false);
    expect(t.at()).toBe("dev");
  });

  it("l expands, then enters, and opens bookmarks", () => {
    const t = makeCtx(["bar"], "dev");
    t.run("fold.open");
    expect(t.expanded().has("dev")).toBe(true);
    t.run("fold.open");
    expect(t.at()).toBe("mdn");
    t.run("fold.open");
    expect(t.opened).toEqual(["current"]);
  });

  it("<CR> toggles folders; t on a folder is an error", () => {
    const t = makeCtx([], "other");
    t.run("open.current");
    expect(t.expanded().has("other")).toBe(true);
    t.run("open.newTab");
    expect(t.opened).toEqual([]);
    expect(t.messages).toEqual(["Not a bookmark"]);
  });

  it("zc inside a folder closes the enclosing folder", () => {
    const t = makeCtx(["bar", "dev"], "mdn");
    t.run("fold.collapse");
    expect(t.expanded().has("dev")).toBe(false);
    expect(t.at()).toBe("dev");
  });

  it("zM keeps the cursor on the top-level ancestor; zR expands all", () => {
    const t = makeCtx(["bar", "dev"], "rust");
    t.run("fold.collapseAll");
    expect(t.at()).toBe("bar");
    expect(t.ctx.rows).toHaveLength(2);
    t.run("fold.expandAll");
    expect(t.ctx.rows).toHaveLength(8);
    expect(t.at()).toBe("bar");
  });
});
