import { send, subscribeChanges, type OpenWhere } from "../shared/protocol";
import type { BNode, PageInfo } from "../shared/types";
import { ACTIONS, type Ctx } from "./actions";
import { createEditor, type Register } from "./edit";
import { helpSections } from "./help";
import { DEFAULT_BINDINGS } from "./keymap/defaults";
import { bindingsFor, KeyEngine, type Match } from "./keymap/engine";
import { eventToToken } from "./keymap/keys";
import { flattenFiltered, searchTree, type Hit } from "./search";
import { clamp, countBookmarks, flatten, indexTree, type Row, type TreeIndex } from "./tree";
import { loadUiState, saveUiState } from "./ui-state";
import { ROW_HEIGHT, TreeView } from "./view";

export interface AppOptions {
  onClose(): void;
  /** true when rendered as the fallback extension page instead of an overlay */
  standalone: boolean;
  /** The page the overlay sits on; the fallback window asks the background instead. */
  currentPage?: () => PageInfo;
}

export interface App {
  /** Returns true when the key was consumed (caller should preventDefault). */
  handleKey(e: KeyboardEvent): boolean;
  focus(): void;
  destroy(): void;
}

type Mode = "NORMAL" | "SEARCH" | "PROMPT" | "CONFIRM" | "HELP";

const MODE_LABEL: Record<Mode, string> = {
  NORMAL: "NORMAL",
  SEARCH: "SEARCH",
  PROMPT: "INPUT",
  CONFIRM: "CONFIRM",
  HELP: "HELP",
};

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

  const title = el("div", "vb-title");
  const totalEl = el("span", "vb-total");
  title.append(el("span", "vb-title-text", "Bookmarks"), totalEl);
  const body = el("div", "vb-body");
  const help = el("div", "vb-help");
  help.hidden = true;
  help.setAttribute("role", "document");
  help.setAttribute("aria-label", "Keyboard shortcuts");

  const status = el("div", "vb-status");
  const modeEl = el("span", "vb-mode");
  const pathEl = el("span", "vb-status-path");
  const showcmdEl = el("span", "vb-showcmd");
  const regEl = el("span", "vb-reg");
  const posEl = el("span", "vb-pos");
  status.append(modeEl, pathEl, showcmdEl, regEl, posEl);

  // Vim-style command line: messages, prompts, the active filter.
  const cmdline = el("div", "vb-cmdline");
  const promptEl = el("span", "vb-prompt");
  const input = el("input", "vb-input");
  input.type = "text";
  input.spellcheck = false;
  input.autocomplete = "off";
  const cmdTextEl = el("span", "vb-cmdtext");
  const cmdRightEl = el("span", "vb-cmdright");
  cmdline.append(promptEl, input, cmdTextEl, cmdRightEl);

  win.append(title, body, help, status, cmdline);
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
  let register: Register | null = null;
  /** Guards against an older tree response overwriting a newer one. */
  let loadSeq = 0;

  let search: Search | null = null;
  /** State to restore when the search prompt is cancelled. */
  let beforeSearch: { search: Search | null; cursorId: string | undefined } | null = null;

  let pendingPrompt: { label: string; resolve: (v: string | null) => void } | null = null;
  let pendingConfirm: { text: string; resolve: (ok: boolean) => void } | null = null;

  const view = new TreeView(body, {
    onClick: (i) => {
      if (mode === "SEARCH") ctx.acceptSearch();
      if (mode === "NORMAL") ctx.setCursor(i);
    },
    onActivate: (i) => {
      if (mode !== "NORMAL") return;
      ctx.setCursor(i);
      run({ action: "open.current", count: null });
    },
  });

  const onMatch = (m: Match): void => {
    run(m);
    renderStatus();
  };
  const engines: Record<Exclude<Mode, "CONFIRM">, KeyEngine> = {
    NORMAL: new KeyEngine(bindingsFor("normal", DEFAULT_BINDINGS), onMatch),
    SEARCH: new KeyEngine(bindingsFor("search", DEFAULT_BINDINGS), onMatch, { counts: false }),
    PROMPT: new KeyEngine(bindingsFor("prompt", DEFAULT_BINDINGS), onMatch, { counts: false }),
    HELP: new KeyEngine(bindingsFor("help", DEFAULT_BINDINGS), onMatch),
  };
  const engine = (): KeyEngine | undefined => (mode === "CONFIRM" ? undefined : engines[mode]);

  // ---- Rendering -----------------------------------------------------------
  function render(): void {
    body.classList.toggle("vb-filtered", search !== null);
    const cut = new Set(register?.op === "cut" ? register.ids : []);
    view.update(rows, cursor, { hits: search?.hits, cut });
    if (loaded) {
      const total = countBookmarks(roots);
      totalEl.textContent = `${total} bookmark${total === 1 ? "" : "s"}`;
    }
    renderStatus();
  }

  function renderStatus(): void {
    const node = rows[cursor]?.node;
    modeEl.textContent = MODE_LABEL[mode];
    modeEl.className = `vb-mode vb-mode-${MODE_LABEL[mode].toLowerCase()}`;
    pathEl.textContent = node ? index.path(node.id).map((n) => n.title || "(untitled)").join(" / ") : "";
    showcmdEl.textContent = engine()?.pending ?? "";
    regEl.textContent = register ? `${register.op === "cut" ? "cut" : "yank"} ${register.ids.length}` : "";
    posEl.textContent = rows.length ? `${cursor + 1}/${rows.length}` : "0/0";

    const typing = mode === "SEARCH" || mode === "PROMPT";
    promptEl.hidden = !typing;
    input.hidden = !typing;
    promptEl.textContent = mode === "SEARCH" ? "/" : (pendingPrompt?.label ?? "");
    cmdTextEl.classList.remove("vb-error", "vb-dim");
    cmdTextEl.textContent = "";
    cmdRightEl.textContent = "";

    if (mode === "SEARCH") {
      const n = search?.hits.size ?? 0;
      cmdRightEl.textContent = input.value.trim() ? `${n} match${n === 1 ? "" : "es"}` : "";
    } else if (mode === "CONFIRM") {
      cmdTextEl.textContent = pendingConfirm?.text ?? "";
    } else if (mode === "PROMPT") {
      cmdRightEl.textContent = "<CR> ok · <Esc> cancel";
    } else if (mode === "HELP") {
      cmdTextEl.textContent = "j/k scroll · ? or q close";
      cmdTextEl.classList.add("vb-dim");
    } else if (msg) {
      cmdTextEl.textContent = msg.text;
      cmdTextEl.classList.toggle("vb-error", msg.error);
    } else if (search) {
      cmdTextEl.textContent = `/${search.query}`;
      cmdTextEl.classList.add("vb-dim");
      const ids = matchRowIds();
      const k = node ? ids.indexOf(node.id) : -1;
      cmdRightEl.textContent = k >= 0 ? `[${k + 1}/${ids.length}]` : `[${ids.length}]`;
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

  function reveal(id: string): void {
    index.path(id).slice(0, -1).forEach((n) => expanded.add(n.id));
    search?.collapsed.forEach((c) => index.path(id).some((n) => n.id === c) && search!.collapsed.delete(c));
  }

  /** Fetch the tree again (after our edits or external changes). */
  async function reloadTree(cursorId?: string): Promise<void> {
    const seq = ++loadSeq;
    const tree = await send({ type: "getTree" });
    if (destroyed || seq !== loadSeq) return;
    roots = tree;
    index = indexTree(roots);
    expanded = new Set([...expanded].filter((id) => index.node(id)?.kind === "folder"));
    if (register) {
      register.ids = register.ids.filter((id) => index.node(id));
      if (register.ids.length === 0) register = null;
    }
    if (search) search.hits = searchTree(roots, search.query).hits;
    if (cursorId !== undefined) reveal(cursorId);
    refresh(cursorId ?? rows[cursor]?.node.id);
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
    if (id !== undefined) reveal(id);
    refresh(id);
  }

  function enterMode(next: Mode): void {
    engine()?.reset();
    mode = next;
    if (next === "SEARCH" || next === "PROMPT") {
      input.hidden = false;
      input.focus({ preventScroll: true });
    } else {
      win.focus({ preventScroll: true });
    }
  }

  // ---- Help ----------------------------------------------------------------
  function renderHelp(): void {
    const nodes = helpSections(DEFAULT_BINDINGS).map((section) => {
      const sec = el("section", "vb-help-section");
      sec.append(el("h2", "vb-help-title", section.title));
      const list = el("dl", "vb-help-list");
      for (const entry of section.entries) {
        const keys = el("dt", "vb-help-keys");
        entry.keys.forEach((k, i) => {
          if (i > 0) keys.append(" ");
          keys.append(el("kbd", "", k));
        });
        list.append(keys, el("dd", "vb-help-desc", entry.description));
      }
      sec.append(list);
      return sec;
    });
    const tip = el("p", "vb-help-tip", "Prefix motions with a count, e.g. 5j or 3n.");
    help.replaceChildren(...nodes, tip);
  }

  // ---- Prompts -------------------------------------------------------------
  function finishPrompt(value: string | null): void {
    const p = pendingPrompt;
    if (!p) return;
    pendingPrompt = null;
    if (mode === "PROMPT") enterMode("NORMAL");
    p.resolve(value);
    renderStatus();
  }

  function finishConfirm(ok: boolean): void {
    const c = pendingConfirm;
    if (!c) return;
    pendingConfirm = null;
    if (mode === "CONFIRM") enterMode("NORMAL");
    c.resolve(ok);
    renderStatus();
  }

  const editor = createEditor(
    {
      get row() {
        return rows[cursor];
      },
      get index() {
        return index;
      },
      get register() {
        return register;
      },
      set register(r) {
        register = r;
        render();
      },
      currentPage: async () => (opts.currentPage ? opts.currentPage() : send({ type: "currentPage" })),
      prompt({ label, value = "", select = false }) {
        finishPrompt(null);
        return new Promise((resolve) => {
          pendingPrompt = { label, resolve };
          input.value = value;
          enterMode("PROMPT");
          if (select) input.select();
          else input.setSelectionRange(value.length, value.length);
          renderStatus();
        });
      },
      confirm(text) {
        finishConfirm(false);
        return new Promise((resolve) => {
          pendingConfirm = { text, resolve };
          enterMode("CONFIRM");
          renderStatus();
        });
      },
      message: (text, error) => ctx.message(text, error),
      reload: (cursorId) => reloadTree(cursorId),
    },
    send,
  );

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
    edit: editor,
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

    openHelp() {
      renderHelp();
      body.hidden = true;
      help.hidden = false;
      help.scrollTop = 0;
      enterMode("HELP");
    },
    closeHelp() {
      if (mode !== "HELP") return;
      help.hidden = true;
      body.hidden = false;
      enterMode("NORMAL");
      render();
    },
    scrollHelp(lines) {
      const max = help.scrollHeight - help.clientHeight;
      help.scrollTop = Math.max(0, Math.min(max, help.scrollTop + lines * ROW_HEIGHT));
    },
    get helpPageSize() {
      return Math.max(1, Math.floor(help.clientHeight / ROW_HEIGHT));
    },

    promptAccept: () => finishPrompt(input.value),
    promptCancel: () => finishPrompt(null),
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
      const seq = ++loadSeq;
      const [tree, state] = await Promise.all([send({ type: "getTree" }), loadUiState()]);
      if (destroyed || seq !== loadSeq) return;
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

  const unsubscribe = subscribeChanges(() => {
    if (loaded) reloadTree().catch(() => {});
  });

  // Click on the dimmed backdrop (outside the window) closes the overlay.
  const onBackdropDown = (e: MouseEvent): void => {
    if (e.target === root) close();
  };
  root.addEventListener("mousedown", onBackdropDown);

  return {
    handleKey(e) {
      const token = eventToToken(e);
      if (token === null) return false;
      if (mode === "CONFIRM") {
        finishConfirm(token === "y" || token === "Y");
        return true;
      }
      if (msg && loaded) msg = null;
      const consumed = engine()!.feed(token);
      // Unconsumed keys in a prompt are typed into the input; make sure it has focus.
      if (!consumed && (mode === "SEARCH" || mode === "PROMPT")) {
        const scope = input.getRootNode() as ShadowRoot | Document;
        if (scope.activeElement !== input) input.focus({ preventScroll: true });
      }
      renderStatus();
      return consumed;
    },
    focus() {
      (mode === "SEARCH" || mode === "PROMPT" ? input : win).focus({ preventScroll: true });
    },
    destroy() {
      if (saveTimer !== undefined) saveNow();
      destroyed = true;
      unsubscribe();
      finishPrompt(null);
      finishConfirm(false);
      Object.values(engines).forEach((e) => e.reset());
      root.removeEventListener("mousedown", onBackdropDown);
      root.replaceChildren();
    },
  };
}
