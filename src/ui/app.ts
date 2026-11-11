import { send, type OpenWhere } from "../shared/protocol";
import type { BNode } from "../shared/types";
import { ACTIONS, type Ctx } from "./actions";
import { DEFAULT_BINDINGS } from "./keymap/defaults";
import { bindingsFor, KeyEngine, type Match } from "./keymap/engine";
import { eventToToken } from "./keymap/keys";
import { flattenFiltered, searchTree, type Hit } from "./search";
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

type Mode = "NORMAL" | "SEARCH";

interface Search {
  query: string;
  hits: Map<string, Hit>;
  /** Folders the user collapsed while this filter is active. */
  collapsed: Set<string>;
}

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
  // ---- DOM -----------------------------------------------------------------
  root.className = opts.standalone ? "vb-backdrop vb-standalone" : "vb-backdrop";
  const win = el("div", "vb-window");
  win.tabIndex = -1;
  win.setAttribute("role", "dialog");
  win.setAttribute("aria-label", "Bookmarks");

  const title = el("div", "vb-title", "Bookmarks");
  const body = el("div", "vb-body");

  const status = el("div", "vb-status");
  const modeEl = el("span", "vb-mode");
  const pathEl = el("span", "vb-status-path");
  const showcmdEl = el("span", "vb-showcmd");
  const posEl = el("span", "vb-pos");
  status.append(modeEl, pathEl, showcmdEl, posEl);

  // Vim-style command line: messages, the search prompt, the active filter.
  const cmdline = el("div", "vb-cmdline");
  const promptEl = el("span", "vb-prompt", "/");
  const input = el("input", "vb-input");
  input.type = "text";
  input.spellcheck = false;
  input.autocomplete = "off";
  input.setAttribute("aria-label", "Search bookmarks");
  const cmdTextEl = el("span", "vb-cmdtext");
  const cmdRightEl = el("span", "vb-cmdright");
  cmdline.append(promptEl, input, cmdTextEl, cmdRightEl);

  win.append(title, body, status, cmdline);
  root.append(win);

  // ---- State ---------------------------------------------------------------
  let mode: Mode = "NORMAL";
  let roots: BNode[] = [];
  let index: TreeIndex = indexTree([]);
  let expanded = new Set<string>();
  let rows: Row[] = [];
  let cursor = 0;
  let loaded = false;
  let msg: { text: string; error: boolean } | null = { text: "Loading…", error: false };
  let destroyed = false;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  let search: Search | null = null;
  /** State to restore when the search prompt is cancelled. */
  let beforeSearch: { search: Search | null; cursorId: string | undefined } | null = null;

  const view = new TreeView(body, {
    onClick: (i) => {
      if (mode === "SEARCH") ctx.acceptSearch();
      ctx.setCursor(i);
    },
    onActivate: (i) => {
      ctx.setCursor(i);
      run({ action: "open.current", count: null });
    },
  });

  const onMatch = (m: Match): void => {
    run(m);
    renderStatus();
  };
  const engines: Record<Mode, KeyEngine> = {
    NORMAL: new KeyEngine(bindingsFor("normal", DEFAULT_BINDINGS), onMatch),
    SEARCH: new KeyEngine(bindingsFor("search", DEFAULT_BINDINGS), onMatch, { counts: false }),
  };

  // ---- Rendering -----------------------------------------------------------
  function render(): void {
    body.classList.toggle("vb-filtered", search !== null);
    view.update(rows, cursor, search?.hits);
    renderStatus();
  }

  function renderStatus(): void {
    const node = rows[cursor]?.node;
    modeEl.textContent = mode;
    modeEl.classList.toggle("vb-mode-search", mode === "SEARCH");
    pathEl.textContent = node ? index.path(node.id).map((n) => n.title || "(untitled)").join(" / ") : "";
    showcmdEl.textContent = engines[mode].pending;
    posEl.textContent = rows.length ? `${cursor + 1}/${rows.length}` : "0/0";

    const searching = mode === "SEARCH";
    promptEl.hidden = !searching;
    input.hidden = !searching;
    cmdTextEl.classList.remove("vb-error", "vb-dim");
    cmdRightEl.textContent = "";

    if (searching) {
      cmdTextEl.textContent = "";
      const n = search?.hits.size ?? 0;
      cmdRightEl.textContent = input.value.trim() ? `${n} match${n === 1 ? "" : "es"}` : "";
    } else if (msg) {
      cmdTextEl.textContent = msg.text;
      cmdTextEl.classList.toggle("vb-error", msg.error);
    } else if (search) {
      cmdTextEl.textContent = `/${search.query}`;
      cmdTextEl.classList.add("vb-dim");
      const ids = matchRowIds();
      const k = node ? ids.indexOf(node.id) : -1;
      cmdRightEl.textContent = k >= 0 ? `[${k + 1}/${ids.length}]` : `[${ids.length}]`;
    } else {
      cmdTextEl.textContent = "";
    }
  }

  function computeRows(): Row[] {
    return search ? flattenFiltered(roots, search.hits, search.collapsed) : flatten(roots, expanded);
  }

  /** Rebuild rows, keeping the cursor on the same node when possible. */
  function refresh(keepId = rows[cursor]?.node.id): void {
    rows = computeRows();
    const i = keepId === undefined ? -1 : rows.findIndex((r) => r.node.id === keepId);
    cursor = i >= 0 ? i : clamp(cursor, 0, Math.max(0, rows.length - 1));
    render();
    scheduleSave();
  }

  // ---- Search --------------------------------------------------------------
  function matchRowIds(): string[] {
    if (!search) return [];
    return rows.filter((r) => search!.hits.has(r.node.id)).map((r) => r.node.id);
  }

  function setQuery(query: string): void {
    if (query.trim() === "") {
      // Empty prompt shows the normal tree, as before searching.
      search = null;
      refresh(beforeSearch?.cursorId);
      return;
    }
    const { hits, bestId } = searchTree(roots, query);
    search = { query, hits, collapsed: new Set() };
    refresh(bestId);
  }

  /** Leave the filter, revealing the cursor's node in the full tree. */
  function dropFilter(): void {
    const id = rows[cursor]?.node.id;
    search = null;
    if (id !== undefined) index.path(id).slice(0, -1).forEach((n) => expanded.add(n.id));
    refresh(id);
  }

  function enterMode(next: Mode): void {
    engines[mode].reset();
    mode = next;
    if (next === "SEARCH") {
      input.hidden = false;
      input.focus({ preventScroll: true });
    } else {
      win.focus({ preventScroll: true });
    }
  }

  // ---- Persistence ---------------------------------------------------------
  function scheduleSave(): void {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, SAVE_DELAY_MS);
  }

  function saveNow(): void {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    if (!loaded) return; // don't clobber stored state with an empty tree
    const cursorId = rows[cursor]?.node.id;
    saveUiState({ expanded: [...expanded], ...(cursorId ? { cursorId } : {}) });
  }

  // ---- Actions context -----------------------------------------------------
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
    get filtered() {
      return search !== null;
    },
    setCursor(i) {
      if (rows.length === 0) return;
      cursor = clamp(i, 0, rows.length - 1);
      render();
      scheduleSave();
    },
    setExpanded(id, open) {
      const closedSet = search?.collapsed;
      if (closedSet) {
        if (open) closedSet.delete(id);
        else closedSet.add(id);
      } else if (open) {
        expanded.add(id);
      } else {
        expanded.delete(id);
      }
      refresh();
    },
    expandAll() {
      if (search) search.collapsed.clear();
      else expanded = new Set(index.folderIds());
      refresh();
    },
    collapseAll() {
      const id = rows[cursor]?.node.id;
      const top = id === undefined ? undefined : index.path(id)[0]?.id;
      if (search) search.collapsed = new Set(index.folderIds());
      else expanded.clear();
      refresh(top);
    },
    open: (where) => void openCurrent(where),
    close,
    message(text, error = false) {
      msg = { text, error };
      renderStatus();
    },

    startSearch() {
      if (!loaded) return;
      beforeSearch = {
        search: search && { ...search, collapsed: new Set(search.collapsed) },
        cursorId: rows[cursor]?.node.id,
      };
      input.value = search?.query ?? "";
      enterMode("SEARCH");
      input.select();
      renderStatus();
    },
    acceptSearch() {
      if (mode !== "SEARCH") return;
      const query = input.value;
      enterMode("NORMAL");
      if (query.trim() === "") {
        search = null;
        refresh(beforeSearch?.cursorId);
      } else if (!search || search.hits.size === 0) {
        ctx.cancelSearch();
        ctx.message(`Pattern not found: ${query.trim()}`, true);
      }
      beforeSearch = null;
      render();
    },
    cancelSearch() {
      const prev = beforeSearch;
      if (mode === "SEARCH") enterMode("NORMAL");
      beforeSearch = null;
      if (!prev) return;
      search = prev.search;
      refresh(prev.cursorId);
    },
    clearSearch() {
      if (search) dropFilter();
    },
    jumpMatch(direction, count) {
      const ids = matchRowIds();
      if (ids.length === 0) {
        if (mode === "NORMAL") ctx.message("No active search", true);
        return;
      }
      let i = cursor;
      let wrapped = false;
      for (let step = 0; step < count; step++) {
        let j = i + direction;
        while (j >= 0 && j < rows.length && !search!.hits.has(rows[j]!.node.id)) j += direction;
        if (j < 0 || j >= rows.length) {
          wrapped = true;
          j = rows.findIndex((r) => r.node.id === (direction > 0 ? ids[0] : ids.at(-1)));
        }
        i = j;
      }
      ctx.setCursor(i);
      if (wrapped && mode === "NORMAL") {
        ctx.message(direction > 0 ? "search hit BOTTOM, continuing at TOP" : "search hit TOP, continuing at BOTTOM");
      }
    },
  };

  function run({ action, count }: Match): void {
    const fn = ACTIONS[action];
    if (fn) fn(ctx, count);
    else ctx.message(`Unknown action: ${action}`, true);
  }

  input.addEventListener("input", () => {
    if (mode === "SEARCH") setQuery(input.value);
  });

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
      loaded = true;
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
      if (msg && loaded) msg = null;
      const consumed = engines[mode].feed(token);
      // Unconsumed keys in the prompt are typed into the input; make sure it has focus.
      if (!consumed && mode === "SEARCH") {
        const scope = input.getRootNode() as ShadowRoot | Document;
        if (scope.activeElement !== input) input.focus({ preventScroll: true });
      }
      renderStatus();
      return consumed;
    },
    focus() {
      (mode === "SEARCH" ? input : win).focus({ preventScroll: true });
    },
    destroy() {
      if (saveTimer !== undefined) saveNow();
      destroyed = true;
      engines.NORMAL.reset();
      engines.SEARCH.reset();
      root.removeEventListener("mousedown", onBackdropDown);
      root.replaceChildren();
    },
  };
}
