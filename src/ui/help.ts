import type { Binding, KeyMode } from "./keymap/engine";
import { parseKeys } from "./keymap/keys";

/** Human-readable descriptions for the `?` help screen. */
export const ACTION_DESCRIPTIONS: Record<string, string> = {
  "cursor.down": "Move down",
  "cursor.up": "Move up",
  "cursor.first": "First item (with count: Nth item)",
  "cursor.last": "Last item (with count: Nth item)",
  "cursor.halfPageDown": "Half a page down",
  "cursor.halfPageUp": "Half a page up",
  "cursor.pageDown": "Page down",
  "cursor.pageUp": "Page up",
  "cursor.parent": "Go to parent folder",

  "fold.close": "Close folder, or go to parent",
  "fold.open": "Open folder, or open bookmark",
  "fold.toggle": "Toggle folder",
  "fold.expand": "Open folder",
  "fold.collapse": "Close folder (or the enclosing one)",
  "fold.expandAll": "Open all folders",
  "fold.collapseAll": "Close all folders",

  "open.current": "Open here / toggle folder",
  "open.newTab": "Open in a new tab",
  "open.background": "Open in a background tab",
  "open.newWindow": "Open in a new window",

  "edit.addBookmark": "Bookmark the current page",
  "edit.addFolder": "New folder",
  "edit.rename": "Rename",
  "edit.editUrl": "Edit URL",
  "edit.cut": "Cut (p/P moves it)",
  "edit.yank": "Yank (p/P pastes a copy)",
  "edit.pasteAfter": "Paste after cursor",
  "edit.pasteBefore": "Paste before cursor",
  "edit.delete": "Delete",

  "search.start": "Search titles and URLs",
  "search.next": "Next match",
  "search.prev": "Previous match",
  "search.accept": "Accept search",
  "search.cancel": "Cancel search",

  "prompt.accept": "Accept",
  "prompt.cancel": "Cancel",

  "help.open": "Show this help",
  "help.close": "Close help",
  "help.down": "Scroll down",
  "help.up": "Scroll up",
  "help.pageDown": "Scroll a page down",
  "help.pageUp": "Scroll a page up",
  "help.top": "Scroll to top",
  "help.bottom": "Scroll to bottom",

  escape: "Clear search filter, then close",
  close: "Close",
};

export interface HelpEntry {
  /** Alternative key sequences, in binding order. */
  keys: string[];
  action: string;
  description: string;
}

export interface HelpSection {
  title: string;
  entries: HelpEntry[];
}

/** Sections for normal-mode actions, by action prefix. */
const NORMAL_SECTIONS: [title: string, matches: (action: string) => boolean][] = [
  ["Move", (a) => a.startsWith("cursor.")],
  ["Folders", (a) => a.startsWith("fold.")],
  ["Open", (a) => a.startsWith("open.")],
  ["Edit", (a) => a.startsWith("edit.")],
  ["Search", (a) => a.startsWith("search.")],
  ["General", (a) => a === "help.open" || a === "escape" || a === "close"],
];

const MODE_SECTIONS: [KeyMode, string][] = [
  ["search", "In the search prompt"],
  ["prompt", "In text prompts"],
  ["help", "In this help"],
];

/** Tokens back to readable notation ("<lt>" shows as "<"). */
const display = (tokens: string[]): string => tokens.map((t) => (t === "<lt>" ? "<" : t)).join("");

/**
 * The bindings that are actually in effect for `mode` (later ones override
 * earlier ones with the same keys, "nop" unbinds), grouped by action.
 */
export function effectiveEntries(mode: KeyMode, bindings: readonly Binding[]): HelpEntry[] {
  const byKeys = new Map<string, { keys: string; action: string }>();
  for (const b of bindings) {
    if ((b.mode ?? "normal") !== mode) continue;
    const tokens = parseKeys(b.keys);
    if (tokens.length === 0) continue;
    byKeys.set(tokens.join("\u0000"), { keys: display(tokens), action: b.action });
  }
  const byAction = new Map<string, HelpEntry>();
  for (const { keys, action } of byKeys.values()) {
    if (action === "nop") continue;
    let entry = byAction.get(action);
    if (!entry) {
      entry = { keys: [], action, description: ACTION_DESCRIPTIONS[action] ?? action };
      byAction.set(action, entry);
    }
    entry.keys.push(keys);
  }
  return [...byAction.values()];
}

export function helpSections(bindings: readonly Binding[]): HelpSection[] {
  const sections: HelpSection[] = [];
  const normal = effectiveEntries("normal", bindings);
  const used = new Set<HelpEntry>();
  for (const [title, matches] of NORMAL_SECTIONS) {
    const entries = normal.filter((e) => matches(e.action));
    entries.forEach((e) => used.add(e));
    if (entries.length) sections.push({ title, entries });
  }
  const other = normal.filter((e) => !used.has(e));
  if (other.length) sections.push({ title: "Other", entries: other });
  for (const [mode, title] of MODE_SECTIONS) {
    const entries = effectiveEntries(mode, bindings);
    if (entries.length) sections.push({ title, entries });
  }
  return sections;
}
