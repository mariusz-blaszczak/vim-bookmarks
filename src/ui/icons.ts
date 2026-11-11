import type { BNode } from "../shared/types";

/**
 * Monochrome tree icons in the style of nvim-tree with a Nerd Font: one shape
 * and one color per kind. Built with createElementNS (no innerHTML) and
 * colored via CSS classes so they follow the theme tokens.
 */

export type IconKind =
  | "folder"
  | "folderOpen"
  | "toolbar"
  | "managed"
  | "page"
  | "pdf"
  | "script"
  | "internal";

type Shape = [tag: string, attrs: Record<string, string>, children?: Shape[]];

const SHAPES: Record<IconKind, Shape[]> = {
  folder: [["path", { d: "M1.5 3.5h4.2l1.6 1.6h7.2v8.4h-13z" }]],
  folderOpen: [
    ["path", { d: "M1.5 13.5v-10h4.2l1.6 1.6h6.2v2.4H3.6z", opacity: "0.55" }],
    ["path", { d: "M1.5 13.5l2.1-6h11.2l-2.1 6z" }],
  ],
  toolbar: [["path", { d: "M8 1.5l1.95 4 4.4.6-3.2 3.1.8 4.4L8 11.5l-3.95 2.1.8-4.4-3.2-3.1 4.4-.6z" }]],
  managed: [
    ["rect", { x: "3", y: "7", width: "10", height: "7.5", rx: "1.4" }],
    ["path", { d: "M5.3 7V5.2a2.7 2.7 0 0 1 5.4 0V7", fill: "none", stroke: "currentColor", "stroke-width": "1.5" }],
  ],
  page: [
    [
      "g",
      { fill: "none", stroke: "currentColor", "stroke-width": "1.15" },
      [
        ["circle", { cx: "8", cy: "8", r: "6.3" }],
        ["ellipse", { cx: "8", cy: "8", rx: "2.7", ry: "6.3" }],
        ["path", { d: "M1.9 6h12.2M1.9 10h12.2" }],
      ],
    ],
  ],
  pdf: [["path", { d: "M3.5 1.5h6l3 3v10h-9z" }]],
  script: [["path", { d: "M9.6 1.5L3.8 9h3.6l-1.2 5.5L12.2 7H8.6z" }]],
  internal: [
    ["circle", { cx: "8", cy: "8", r: "5", fill: "none", stroke: "currentColor", "stroke-width": "2.4", "stroke-dasharray": "2.05 1.88" }],
    ["circle", { cx: "8", cy: "8", r: "2" }],
  ],
};

const INTERNAL_SCHEMES = /^(chrome|about|edge|brave|opera|vivaldi|moz-extension|chrome-extension|file|view-source|place):/i;

/** Which icon a bookmark URL gets. */
export function urlIcon(url: string | undefined): IconKind {
  if (!url) return "page";
  if (/^javascript:/i.test(url)) return "script";
  if (INTERNAL_SCHEMES.test(url)) return "internal";
  try {
    if (/\.pdf$/i.test(new URL(url).pathname)) return "pdf";
  } catch {
    // Not a parseable URL; fall through to a plain page.
  }
  return "page";
}

export function iconKind(node: BNode, open: boolean): IconKind | null {
  switch (node.kind) {
    case "folder":
      if (node.role === "toolbar") return "toolbar";
      if (node.locked) return "managed";
      return open ? "folderOpen" : "folder";
    case "bookmark":
      return urlIcon(node.url);
    case "separator":
      return null;
  }
}

const NS = "http://www.w3.org/2000/svg";

function build([tag, attrs, children = []]: Shape): SVGElement {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const child of children) el.append(build(child));
  return el;
}

const templates = new Map<IconKind, SVGElement>();

function template(kind: IconKind): SVGElement {
  let svg = templates.get(kind);
  if (!svg) {
    svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("fill", "currentColor");
    svg.setAttribute("class", `vb-icon vb-icon-${kind}`);
    for (const shape of SHAPES[kind]) svg.append(build(shape));
    templates.set(kind, svg);
  }
  return svg;
}

/** An icon element for a tree row; an empty placeholder for separators. */
export function renderIcon(node: BNode, open: boolean): Element {
  const kind = iconKind(node, open);
  if (!kind) {
    const blank = document.createElement("span");
    blank.className = "vb-icon";
    return blank;
  }
  return template(kind).cloneNode(true) as Element;
}
