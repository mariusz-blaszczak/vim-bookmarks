import { send, type OpenWhere } from "../shared/protocol";
import type { BNode } from "../shared/types";
import { ACTIONS, type Ctx } from "./actions";
import { DEFAULT_BINDINGS } from "./keymap/defaults";
import { KeyEngine, type Match } from "./keymap/engine";
import { eventToToken } from "./keymap/keys";
import { clamp, flatten, indexTree, type Row, type TreeIndex } from "./tree";
import { loadUiState, saveUiState } from "./ui-state";
import { TreeView } from "./view";

export interface AppOptions {
  onClose(): void;
  /** true when rendered as the fallback extension page instead of an overlay */
  standalone: boolean;
}

export interface App {
  /** Returns true when the key was consumed (caller should preventDefault). */
  handleKey(e: KeyboardEvent): boolean;
  focus(): void;
  destroy(): void;
}

type Mode = "NORMAL";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const SAVE_DELAY_MS = 250;

export function mountApp(root: HTMLElement, opts: AppOptions): App {
  const mode: Mode = "NORMAL";

  // ---- DOM -----------------------------------------------------------------
  root.className = opts.standalone ? "vb-backdrop vb-standalone" : "vb-backdrop";
  const win = el("div", "vb-window");
  win.tabIndex = -1;
  win.setAttribute("role", "dialog");
  win.setAttribute("aria-label", "Bookmarks");

  const title = el("div", "vb-title", "Bookmarks");
  const body = el("div", "vb-body");
  const status = el("div", "vb-status");
  const modeEl = el("span", "vb-mode", mode);
  const pathEl = el("span", "vb-status-path");
  const showcmdEl = el("span", "vb-showcmd");
  const posEl = el("span", "vb-pos");
  status.append(modeEl, pathEl, showcmdEl, posEl);
  win.append(title, body, status);
  root.append(win);

  // ---- State ---------------------------------------------------------------
  let roots: BNode[] = [];
  let index: TreeIndex = indexTree([]);
  let expanded = new Set<string>();
  let rows: Row[] = [];
  let cursor = 0;
  let msg: { text: string; error: boolean } | null = { text: "Loading…", error: false };
  let destroyed = false;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  const view = new TreeView(body, {
    onClick: (i) => ctx.setCursor(i),
    onActivate: (i) => {
      ctx.setCursor(i);
      run({ action: "open.current", count: null });
    },
  });
  const engine = new KeyEngine(DEFAULT_BINDINGS, (m) => {
    run(m);
    renderStatus();
  });

  function render(): void {
    view.update(rows, cursor);
    renderStatus();
  }

  function renderStatus(): void {
    const node = rows[cursor]?.node;
    if (msg) {
      pathEl.textContent = msg.text;
      pathEl.classList.toggle("vb-error", msg.error);
    } else {
      pathEl.textContent = node ? index.path(node.id).map((n) => n.title || "(untitled)").join(" / ") : "";
      pathEl.classList.remove("vb-error");
    }
    showcmdEl.textContent = engine.pending;
    posEl.textContent = rows.length ? `${cursor + 1}/${rows.length}` : "0/0";
  }

  /** Rebuild rows, keeping the cursor on the same node when possible. */
  function refresh(keepId = rows[cursor]?.node.id): void {
    rows = flatten(roots, expanded);
    const i = keepId === undefined ? -1 : rows.findIndex((r) => r.node.id === keepId);
    cursor = i >= 0 ? i : clamp(cursor, 0, Math.max(0, rows.length - 1));
    render();
    scheduleSave();
  }

  function scheduleSave(): void {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, SAVE_DELAY_MS);
  }

  function saveNow(): void {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    if (roots.length === 0) return; // nothing loaded; don't clobber stored state
    const cursorId = rows[cursor]?.node.id;
    saveUiState({ expanded: [...expanded], ...(cursorId ? { cursorId } : {}) });
  }

  async function openCurrent(where: OpenWhere): Promise<void> {
    const url = rows[cursor]?.node.url;
    if (!url) return;
    try {
      await send({ type: "open", url, where });
      if (where === "background") ctx.message("Opened in background tab");
      else close();
    } catch (err) {
      ctx.message(`Can't open: ${(err as Error).message}`, true);
    }
  }

  function close(): void {
    if (!destroyed) opts.onClose();
  }

  const ctx: Ctx = {
    get rows() {
      return rows;
    },
    get cursor() {
      return cursor;
    },
    get pageSize() {
      return view.pageSize;
    },
    setCursor(i) {
      if (rows.length === 0) return;
      cursor = clamp(i, 0, rows.length - 1);
      render();
      scheduleSave();
    },
    setExpanded(id, open) {
      if (open) expanded.add(id);
      else expanded.delete(id);
      refresh();
    },
    expandAll() {
      expanded = new Set(index.folderIds());
      refresh();
    },
    collapseAll() {
      const id = rows[cursor]?.node.id;
      const top = id === undefined ? undefined : index.path(id)[0]?.id;
      expanded.clear();
      refresh(top);
    },
    open: (where) => void openCurrent(where),
    close,
    message(text, error = false) {
      msg = { text, error };
      renderStatus();
    },
  };

  function run({ action, count }: Match): void {
    const fn = ACTIONS[action];
    if (fn) fn(ctx, count);
    else ctx.message(`Unknown action: ${action}`, true);
  }

  // ---- Load ----------------------------------------------------------------
  async function load(): Promise<void> {
    try {
      const [tree, state] = await Promise.all([send({ type: "getTree" }), loadUiState()]);
      if (destroyed) return;
      roots = tree;
      index = indexTree(roots);
      if (state) {
        expanded = new Set(state.expanded.filter((id) => index.node(id)?.kind === "folder"));
      } else {
        const toolbar = roots.find((r) => r.role === "toolbar") ?? roots[0];
        expanded = new Set(toolbar ? [toolbar.id] : []);
      }
      msg = null;
      cursor = 0;
      refresh(state?.cursorId);
    } catch (err) {
      if (destroyed) return;
      ctx.message(`Failed to load bookmarks: ${(err as Error).message}`, true);
    }
  }
  render();
  void load();

  // Click on the dimmed backdrop (outside the window) closes the overlay.
  const onBackdropDown = (e: MouseEvent): void => {
    if (e.target === root) close();
  };
  root.addEventListener("mousedown", onBackdropDown);

  return {
    handleKey(e) {
      const token = eventToToken(e);
      if (token === null) return false;
      if (msg && rows.length > 0) msg = null;
      const consumed = engine.feed(token);
      renderStatus();
      return consumed;
    },
    focus() {
      win.focus({ preventScroll: true });
    },
    destroy() {
      if (saveTimer !== undefined) saveNow();
      destroyed = true;
      engine.reset();
      root.removeEventListener("mousedown", onBackdropDown);
      root.replaceChildren();
    },
  };
}
