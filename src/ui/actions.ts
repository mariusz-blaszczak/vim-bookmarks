import type { OpenWhere } from "../shared/protocol";
import { parentRow, type Row } from "./tree";

/** What actions can see and do. Implemented by the app. */
export interface Ctx {
  readonly rows: readonly Row[];
  readonly cursor: number;
  readonly pageSize: number;
  setCursor(index: number): void;
  setExpanded(id: string, open: boolean): void;
  expandAll(): void;
  collapseAll(): void;
  open(where: OpenWhere): void;
  close(): void;
  message(text: string, error?: boolean): void;
}

export type ActionFn = (ctx: Ctx, count: number | null) => void;

const current = (ctx: Ctx): Row | undefined => ctx.rows[ctx.cursor];

function openOrToggle(where: OpenWhere): ActionFn {
  return (ctx) => {
    const row = current(ctx);
    if (!row) return;
    if (row.node.kind === "bookmark") ctx.open(where);
    else if (row.node.kind === "folder" && where === "current") ctx.setExpanded(row.node.id, !row.open);
    else if (row.node.kind === "folder") ctx.message("Not a bookmark", true);
  };
}

export const ACTIONS: Record<string, ActionFn> = {
  "cursor.down": (ctx, n) => ctx.setCursor(ctx.cursor + (n ?? 1)),
  "cursor.up": (ctx, n) => ctx.setCursor(ctx.cursor - (n ?? 1)),
  "cursor.first": (ctx, n) => ctx.setCursor(n === null ? 0 : n - 1),
  "cursor.last": (ctx, n) => ctx.setCursor(n === null ? ctx.rows.length - 1 : n - 1),
  "cursor.halfPageDown": (ctx, n) => ctx.setCursor(ctx.cursor + (n ?? 1) * Math.max(1, Math.floor(ctx.pageSize / 2))),
  "cursor.halfPageUp": (ctx, n) => ctx.setCursor(ctx.cursor - (n ?? 1) * Math.max(1, Math.floor(ctx.pageSize / 2))),
  "cursor.pageDown": (ctx, n) => ctx.setCursor(ctx.cursor + (n ?? 1) * ctx.pageSize),
  "cursor.pageUp": (ctx, n) => ctx.setCursor(ctx.cursor - (n ?? 1) * ctx.pageSize),
  "cursor.parent": (ctx) => {
    const p = parentRow(ctx.rows, ctx.cursor);
    if (p >= 0) ctx.setCursor(p);
  },

  "fold.close": (ctx) => {
    const row = current(ctx);
    if (!row) return;
    if (row.node.kind === "folder" && row.open) {
      ctx.setExpanded(row.node.id, false);
      return;
    }
    const p = parentRow(ctx.rows, ctx.cursor);
    if (p >= 0) ctx.setCursor(p);
  },
  "fold.open": (ctx) => {
    const row = current(ctx);
    if (!row) return;
    if (row.node.kind === "bookmark") ctx.open("current");
    else if (row.node.kind === "folder" && !row.open) ctx.setExpanded(row.node.id, true);
    else if (row.node.kind === "folder" && (row.node.children?.length ?? 0) > 0) ctx.setCursor(ctx.cursor + 1);
  },
  "fold.toggle": (ctx) => {
    const row = current(ctx);
    if (row?.node.kind === "folder") ctx.setExpanded(row.node.id, !row.open);
  },
  "fold.expand": (ctx) => {
    const row = current(ctx);
    if (row?.node.kind === "folder") ctx.setExpanded(row.node.id, true);
  },
  "fold.collapse": (ctx) => {
    const row = current(ctx);
    if (!row) return;
    if (row.node.kind === "folder" && row.open) {
      ctx.setExpanded(row.node.id, false);
      return;
    }
    // Like Vim's zc inside a fold: close the enclosing folder.
    const p = parentRow(ctx.rows, ctx.cursor);
    const parent = ctx.rows[p];
    if (parent) {
      ctx.setExpanded(parent.node.id, false);
      ctx.setCursor(p);
    }
  },
  "fold.expandAll": (ctx) => ctx.expandAll(),
  "fold.collapseAll": (ctx) => ctx.collapseAll(),

  "open.current": openOrToggle("current"),
  "open.newTab": openOrToggle("newTab"),
  "open.background": openOrToggle("background"),
  "open.newWindow": openOrToggle("newWindow"),

  close: (ctx) => ctx.close(),
};
