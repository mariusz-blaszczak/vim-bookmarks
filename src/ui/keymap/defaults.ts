import type { Binding } from "./engine";

export const DEFAULT_BINDINGS: readonly Binding[] = [
  // Motion
  { keys: "j", action: "cursor.down" },
  { keys: "<Down>", action: "cursor.down" },
  { keys: "k", action: "cursor.up" },
  { keys: "<Up>", action: "cursor.up" },
  { keys: "gg", action: "cursor.first" },
  { keys: "<Home>", action: "cursor.first" },
  { keys: "G", action: "cursor.last" },
  { keys: "<End>", action: "cursor.last" },
  { keys: "<C-d>", action: "cursor.halfPageDown" },
  { keys: "<C-u>", action: "cursor.halfPageUp" },
  { keys: "<C-f>", action: "cursor.pageDown" },
  { keys: "<PageDown>", action: "cursor.pageDown" },
  { keys: "<C-b>", action: "cursor.pageUp" },
  { keys: "<PageUp>", action: "cursor.pageUp" },
  { keys: "-", action: "cursor.parent" },

  // Folds
  { keys: "h", action: "fold.close" },
  { keys: "<Left>", action: "fold.close" },
  { keys: "l", action: "fold.open" },
  { keys: "<Right>", action: "fold.open" },
  { keys: "za", action: "fold.toggle" },
  { keys: "zo", action: "fold.expand" },
  { keys: "zc", action: "fold.collapse" },
  { keys: "zR", action: "fold.expandAll" },
  { keys: "zM", action: "fold.collapseAll" },

  // Open
  { keys: "<CR>", action: "open.current" },
  { keys: "t", action: "open.newTab" },
  { keys: "T", action: "open.background" },
  { keys: "w", action: "open.newWindow" },

  // Overlay
  { keys: "q", action: "close" },
  { keys: "<Esc>", action: "close" },
];
