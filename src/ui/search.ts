import type { BNode } from "../shared/types";
import type { Row } from "./tree";

export interface TermMatch {
  score: number;
  positions: number[];
}

export interface Hit {
  score: number;
  /** Matched character indices in node.title. */
  title: number[];
  /** Matched character indices in node.url. */
  url: number[];
}

const URL_WEIGHT = 0.8;
/** A scattered match should lose to an exact substring elsewhere (e.g. in the URL). */
const SCATTER_PENALTY = 10;

/** Per-code-unit lowercase, so indices stay aligned with the original string. */
function fold(s: string): string {
  let out = "";
  for (const c of s) {
    const lower = c.toLowerCase();
    out += lower.length === c.length ? lower : c;
  }
  return out;
}

const isAlnum = (c: string | undefined): boolean => c !== undefined && /[\p{L}\p{N}]/u.test(c);

function isBoundary(text: string, i: number): boolean {
  if (i === 0) return true;
  const prev = text[i - 1];
  const cur = text[i]!;
  if (!isAlnum(prev)) return true;
  return prev === prev!.toLowerCase() && cur !== cur.toLowerCase(); // camelCase
}

function scorePositions(text: string, positions: readonly number[]): number {
  let score = 0;
  positions.forEach((p, k) => {
    score += 16;
    if (p === 0) score += 12;
    else if (isBoundary(text, p)) score += 10;
    if (k > 0) {
      const gap = p - positions[k - 1]! - 1;
      score += gap === 0 ? 12 : -Math.min(gap, 12);
    }
  });
  return score;
}

/**
 * Fuzzy-match one term against text. Smart case: a term with an uppercase
 * letter is case-sensitive. Contiguous substrings are preferred; otherwise
 * the tightest in-order subsequence ending at the earliest possible place.
 */
export function fuzzyMatch(term: string, text: string): TermMatch | null {
  if (term === "") return { score: 0, positions: [] };
  const caseSensitive = /\p{Lu}/u.test(term);
  const hay = caseSensitive ? text : fold(text);
  const needle = caseSensitive ? term : fold(term);

  let best: TermMatch | null = null;
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) {
    const positions = Array.from({ length: needle.length }, (_, k) => i + k);
    const score = scorePositions(text, positions);
    if (!best || score > best.score) best = { score, positions };
  }
  if (best) return best;

  // Forward pass: earliest end of an in-order match.
  let ti = 0;
  let end = -1;
  for (const ch of needle) {
    end = hay.indexOf(ch, ti);
    if (end < 0) return null;
    ti = end + 1;
  }
  // Backward pass from that end: tightest window.
  const positions: number[] = [];
  let j = end;
  for (let k = needle.length - 1; k >= 0; k--) {
    j = hay.lastIndexOf(needle[k]!, j);
    positions.unshift(j);
    j--;
  }
  return { score: scorePositions(text, positions) - SCATTER_PENALTY, positions };
}

export function parseQuery(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean);
}

/** All terms must match, each in the title or the URL (title preferred). */
export function matchNode(terms: readonly string[], node: BNode): Hit | null {
  if (node.kind === "separator" || terms.length === 0) return null;
  const title = new Set<number>();
  const url = new Set<number>();
  let score = 0;
  for (const term of terms) {
    const t = fuzzyMatch(term, node.title);
    const u = node.url ? fuzzyMatch(term, node.url) : null;
    const ts = t ? t.score : -Infinity;
    const us = u ? u.score * URL_WEIGHT : -Infinity;
    if (t && ts >= us) {
      score += ts;
      t.positions.forEach((p) => title.add(p));
    } else if (u) {
      score += us;
      u.positions.forEach((p) => url.add(p));
    } else {
      return null;
    }
  }
  const sorted = (s: Set<number>) => [...s].sort((a, b) => a - b);
  return { score, title: sorted(title), url: sorted(url) };
}

export interface SearchResult {
  hits: Map<string, Hit>;
  /** Highest-scoring hit (first in tree order on ties). */
  bestId: string | undefined;
}

export function searchTree(roots: readonly BNode[], query: string): SearchResult {
  const terms = parseQuery(query);
  const hits = new Map<string, Hit>();
  let bestId: string | undefined;
  let bestScore = -Infinity;
  const walk = (nodes: readonly BNode[]): void => {
    for (const n of nodes) {
      const hit = matchNode(terms, n);
      if (hit) {
        hits.set(n.id, hit);
        if (hit.score > bestScore) {
          bestScore = hit.score;
          bestId = n.id;
        }
      }
      if (n.children) walk(n.children);
    }
  };
  if (terms.length > 0) walk(roots);
  return { hits, bestId };
}

/**
 * Flatten only hits and their ancestors. Folders are open unless the user
 * collapsed them during this search; a folder with no visible children is
 * shown closed.
 */
export function flattenFiltered(
  roots: readonly BNode[],
  hits: ReadonlyMap<string, unknown>,
  collapsed: ReadonlySet<string>,
): Row[] {
  const visible = new Set<string>();
  const mark = (n: BNode): boolean => {
    let any = hits.has(n.id);
    for (const c of n.children ?? []) if (mark(c)) any = true;
    if (any) visible.add(n.id);
    return any;
  };
  roots.forEach(mark);

  const rows: Row[] = [];
  const walk = (nodes: readonly BNode[], depth: number): void => {
    for (const node of nodes) {
      if (!visible.has(node.id)) continue;
      const kids = (node.children ?? []).filter((c) => visible.has(c.id));
      const open = kids.length > 0 && !collapsed.has(node.id);
      rows.push({ node, depth, open });
      if (open) walk(kids, depth + 1);
    }
  };
  walk(roots, 0);
  return rows;
}
