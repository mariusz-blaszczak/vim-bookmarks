import type { Send } from "../shared/protocol";
import type { BNode, PageInfo } from "../shared/types";
import { countDescendants, insertTarget, isProtected, type Row, type TreeIndex } from "./tree";

/** Items marked with dd (move on paste) or yy (copy on paste). */
export interface Register {
  op: "cut" | "copy";
  ids: string[];
}

/** What the editor needs from the app. */
export interface EditHost {
  readonly row: Row | undefined;
  readonly index: TreeIndex;
  register: Register | null;
  currentPage(): Promise<PageInfo | null>;
  /** Ask for a line of text; resolves null when cancelled. */
  prompt(opts: { label: string; value?: string; select?: boolean }): Promise<string | null>;
  /** Ask a y/N question. */
  confirm(text: string): Promise<boolean>;
  message(text: string, error?: boolean): void;
  /** Reload the tree, optionally moving the cursor to `cursorId` and revealing it. */
  reload(cursorId?: string): Promise<void>;
}

const label = (n: BNode): string => n.title || n.url || "(untitled)";
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Accept "example.com" as https://example.com; reject unparseable input. */
export function normalizeUrl(input: string): string | null {
  const v = input.trim();
  if (v === "") return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
  try {
    new URL(withScheme);
    return withScheme;
  } catch {
    return null;
  }
}

export function createEditor(host: EditHost, send: Send) {
  /** Run an operation, turning failures into an error message. */
  async function attempt(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      host.message(err instanceof Error ? err.message : String(err), true);
    }
  }

  /** The cursor row if it may be modified, otherwise report why not. */
  function editableRow(): Row | null {
    const row = host.row;
    if (!row) return null;
    if (isProtected(host.index, row.node.id)) {
      const managed = host.index.path(row.node.id).some((n) => n.locked);
      host.message(managed ? "Managed bookmarks can't be changed" : "Built-in folders can't be changed", true);
      return null;
    }
    return row;
  }

  function insertableTarget(where: "after" | "before") {
    const row = host.row;
    if (!row) return null;
    const target = insertTarget(row, host.index, where);
    if (host.index.path(target.parentId).some((n) => n.locked)) {
      host.message("Managed bookmarks can't be changed", true);
      return null;
    }
    return target;
  }

  return {
    async addBookmark(): Promise<void> {
      const target = insertableTarget("after");
      if (!target) return;
      const page = await host.currentPage();
      if (!page) {
        host.message("Can't read the current page's URL", true);
        return;
      }
      const title = await host.prompt({ label: "Add bookmark: ", value: page.title, select: true });
      if (title === null) return;
      await attempt(async () => {
        const id = await send({ type: "create", target, title, url: page.url });
        await host.reload(id);
        host.message(`Added "${title || page.url}"`);
      });
    },

    async addFolder(): Promise<void> {
      const target = insertableTarget("after");
      if (!target) return;
      const title = await host.prompt({ label: "New folder: " });
      if (title === null) return;
      if (title.trim() === "") {
        host.message("Folder name can't be empty", true);
        return;
      }
      await attempt(async () => {
        const id = await send({ type: "create", target, title: title.trim() });
        await host.reload(id);
      });
    },

    async rename(): Promise<void> {
      const row = editableRow();
      if (!row || row.node.kind === "separator") return;
      const title = await host.prompt({ label: "Rename: ", value: row.node.title, select: true });
      if (title === null || title === row.node.title) return;
      await attempt(async () => {
        await send({ type: "update", id: row.node.id, title });
        await host.reload(row.node.id);
      });
    },

    async editUrl(): Promise<void> {
      const row = editableRow();
      if (!row) return;
      if (row.node.kind !== "bookmark") {
        host.message("Not a bookmark", true);
        return;
      }
      const input = await host.prompt({ label: "URL: ", value: row.node.url ?? "" });
      if (input === null) return;
      const url = normalizeUrl(input);
      if (!url) {
        host.message(`Invalid URL: ${input}`, true);
        return;
      }
      if (url === row.node.url) return;
      await attempt(async () => {
        await send({ type: "update", id: row.node.id, url });
        await host.reload(row.node.id);
      });
    },

    cut(): void {
      const row = editableRow();
      if (!row) return;
      host.register = { op: "cut", ids: [row.node.id] };
      host.message(`Cut "${label(row.node)}" — p/P to move it`);
    },

    yank(): void {
      const row = host.row;
      if (!row) return;
      host.register = { op: "copy", ids: [row.node.id] };
      host.message(`Yanked "${label(row.node)}" — p/P to paste a copy`);
    },

    async paste(where: "after" | "before"): Promise<void> {
      const reg = host.register;
      if (!reg) {
        host.message("Nothing to paste (use dd or yy first)", true);
        return;
      }
      const target = insertableTarget(where);
      if (!target) return;
      await attempt(async () => {
        if (reg.op === "cut") {
          await send({ type: "move", ids: reg.ids, target });
          host.register = null;
          await host.reload(reg.ids[0]);
          host.message(`Moved ${plural(reg.ids.length, "item")}`);
        } else {
          const ids = await send({ type: "copy", ids: reg.ids, target });
          await host.reload(ids[0]);
          host.message(`Pasted ${ids.length} ${ids.length === 1 ? "copy" : "copies"}`);
        }
      });
    },

    async remove(): Promise<void> {
      const row = editableRow();
      if (!row) return;
      const { node } = row;
      const inside = countDescendants(node);
      if (node.kind === "folder" && inside > 0) {
        const ok = await host.confirm(`Delete folder "${label(node)}" and ${plural(inside, "item")} inside? [y/N]`);
        if (!ok) return;
      }
      await attempt(async () => {
        await send({ type: "remove", id: node.id });
        if (host.register?.ids.includes(node.id)) host.register = null;
        await host.reload();
        host.message(`Deleted "${label(node)}"`);
      });
    },
  };
}

export type Editor = ReturnType<typeof createEditor>;
