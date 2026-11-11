import type { Hit } from "./search";
import type { Row } from "./tree";

export const ROW_HEIGHT = 20;
const OVERSCAN = 8;
const SCROLLOFF = 3;

export interface RowMarks {
  /** Search hits to highlight. */
  hits?: ReadonlyMap<string, Hit> | undefined;
  /** Nodes marked with dd. */
  cut?: ReadonlySet<string>;
}

export interface ViewHandlers {
  onClick(index: number): void;
  onActivate(index: number): void;
}

/** Virtualized tree list: only rows near the viewport are in the DOM. */
export class TreeView {
  private readonly spacer: HTMLElement;
  private readonly layer: HTMLElement;
  private rows: readonly Row[] = [];
  private cursor = 0;
  private hits: ReadonlyMap<string, Hit> | undefined;
  private cut: ReadonlySet<string> = new Set();

  constructor(private readonly body: HTMLElement, handlers: ViewHandlers) {
    this.spacer = document.createElement("div");
    this.spacer.className = "vb-spacer";
    this.layer = document.createElement("div");
    this.layer.className = "vb-layer";
    this.layer.setAttribute("role", "tree");
    body.append(this.spacer, this.layer);

    body.addEventListener("scroll", () => this.paint(), { passive: true });
    const indexOf = (e: MouseEvent): number | null => {
      const row = (e.target as Element | null)?.closest<HTMLElement>(".vb-row");
      return row ? Number(row.dataset.index) : null;
    };
    body.addEventListener("click", (e) => {
      const i = indexOf(e);
      if (i !== null) handlers.onClick(i);
    });
    body.addEventListener("dblclick", (e) => {
      const i = indexOf(e);
      if (i !== null) handlers.onActivate(i);
    });
  }

  get pageSize(): number {
    return Math.max(1, Math.floor(this.body.clientHeight / ROW_HEIGHT));
  }

  update(rows: readonly Row[], cursor: number, marks: RowMarks = {}): void {
    this.rows = rows;
    this.cursor = cursor;
    this.hits = marks.hits;
    this.cut = marks.cut ?? new Set();
    this.spacer.style.height = `${rows.length * ROW_HEIGHT}px`;
    this.scrollToCursor();
    this.paint();
  }

  private scrollToCursor(): void {
    const height = this.body.clientHeight;
    const top = this.body.scrollTop;
    const off = Math.min(SCROLLOFF, Math.floor((this.pageSize - 1) / 2));
    const wantTop = (this.cursor - off) * ROW_HEIGHT;
    const wantBottom = (this.cursor + off + 1) * ROW_HEIGHT;
    if (wantTop < top) this.body.scrollTop = Math.max(0, wantTop);
    else if (wantBottom > top + height) this.body.scrollTop = wantBottom - height;
  }

  private paint(): void {
    const top = this.body.scrollTop;
    const height = this.body.clientHeight;
    const start = Math.max(0, Math.floor(top / ROW_HEIGHT) - OVERSCAN);
    const end = Math.min(this.rows.length, Math.ceil((top + height) / ROW_HEIGHT) + OVERSCAN);
    this.layer.style.transform = `translateY(${start * ROW_HEIGHT}px)`;
    const nodes: HTMLElement[] = [];
    for (let i = start; i < end; i++) {
      const row = this.rows[i]!;
      const el = renderRow(row, i, i === this.cursor, this.hits?.get(row.node.id));
      if (this.cut.has(row.node.id)) el.classList.add("vb-cut");
      nodes.push(el);
    }
    this.layer.replaceChildren(...nodes);
  }
}

function span(className: string, text: string): HTMLSpanElement {
  const s = document.createElement("span");
  s.className = className;
  s.textContent = text;
  return s;
}

function host(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

/** Text with the given character indices wrapped in <mark>. */
function highlighted(className: string, text: string, positions: readonly number[] = []): HTMLSpanElement {
  const s = span(className, "");
  if (positions.length === 0) {
    s.textContent = text;
    return s;
  }
  const set = new Set(positions);
  let run = "";
  let inMark = false;
  const flush = (): void => {
    if (run === "") return;
    if (inMark) {
      const m = document.createElement("mark");
      m.textContent = run;
      s.append(m);
    } else {
      s.append(run);
    }
    run = "";
  };
  for (let i = 0; i < text.length; i++) {
    const mark = set.has(i);
    if (mark !== inMark) {
      flush();
      inMark = mark;
    }
    run += text[i];
  }
  flush();
  return s;
}

/** Shift URL match positions onto the displayed host substring. */
function hostPositions(url: string, shown: string, positions: readonly number[]): number[] {
  const start = url.indexOf(shown);
  if (start < 0) return [];
  return positions.filter((p) => p >= start && p < start + shown.length).map((p) => p - start);
}

function renderRow(row: Row, index: number, isCursor: boolean, hit: Hit | undefined): HTMLElement {
  const { node, depth } = row;
  const el = document.createElement("div");
  el.className = `vb-row vb-${node.kind}${isCursor ? " vb-cursor" : ""}${hit ? " vb-hit" : ""}`;
  el.dataset.index = String(index);
  el.setAttribute("role", "treeitem");
  el.setAttribute("aria-level", String(depth + 1));
  if (isCursor) el.setAttribute("aria-selected", "true");
  el.style.paddingLeft = `calc(8px + ${depth * 2}ch)`;

  switch (node.kind) {
    case "folder": {
      el.setAttribute("aria-expanded", String(row.open));
      el.append(
        span("vb-fold", row.open ? "▾ " : "▸ "),
        highlighted("vb-name", node.title || "(untitled)", node.title ? hit?.title : []),
        span("vb-count", ` ${node.children?.length ?? 0}`),
      );
      break;
    }
    case "bookmark": {
      const name = node.title
        ? highlighted("vb-name", node.title, hit?.title)
        : highlighted("vb-name", node.url || "(untitled)", node.url ? hit?.url : []);
      el.append(span("vb-fold", "  "), name);
      if (node.url) {
        const shown = host(node.url);
        el.append(highlighted("vb-url", shown, hit ? hostPositions(node.url, shown, hit.url) : []));
      }
      break;
    }
    case "separator":
      el.append(span("vb-fold", "  "), span("vb-sep", ""));
      break;
  }
  return el;
}
