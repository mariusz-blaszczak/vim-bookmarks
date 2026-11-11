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

  // Edit
  { keys: "a", action: "edit.addBookmark" },
  { keys: "A", action: "edit.addFolder" },
  { keys: "r", action: "edit.rename" },
  { keys: "e", action: "edit.editUrl" },
  { keys: "dd", action: "edit.cut" },
  { keys: "yy", action: "edit.yank" },
  { keys: "p", action: "edit.pasteAfter" },
  { keys: "P", action: "edit.pasteBefore" },
  { keys: "x", action: "edit.delete" },
  { keys: "<Del>", action: "edit.delete" },

  // Search
  { keys: "/", action: "search.start" },
  { keys: "n", action: "search.next" },
  { keys: "N", action: "search.prev" },

  // Overlay
  { keys: "?", action: "help.open" },
  { keys: "q", action: "close" },
  // Clears an active search filter first, then closes.
  { keys: "<Esc>", action: "escape" },

  // Search prompt (unbound keys are typed into the input)
  { mode: "search", keys: "<CR>", action: "search.accept" },
  { mode: "search", keys: "<Esc>", action: "search.cancel" },
  { mode: "search", keys: "<C-c>", action: "search.cancel" },
  { mode: "search", keys: "<C-n>", action: "search.next" },
  { mode: "search", keys: "<Down>", action: "search.next" },
  { mode: "search", keys: "<Tab>", action: "search.next" },
  { mode: "search", keys: "<C-p>", action: "search.prev" },
  { mode: "search", keys: "<Up>", action: "search.prev" },
  { mode: "search", keys: "<S-Tab>", action: "search.prev" },

  // Text prompts (rename, URL, new folder…)
  { mode: "prompt", keys: "<CR>", action: "prompt.accept" },
  { mode: "prompt", keys: "<Esc>", action: "prompt.cancel" },
  { mode: "prompt", keys: "<C-c>", action: "prompt.cancel" },

  // Help screen (?)
  { mode: "help", keys: "j", action: "help.down" },
  { mode: "help", keys: "<Down>", action: "help.down" },
  { mode: "help", keys: "k", action: "help.up" },
  { mode: "help", keys: "<Up>", action: "help.up" },
  { mode: "help", keys: "<C-d>", action: "help.pageDown" },
  { mode: "help", keys: "<C-f>", action: "help.pageDown" },
  { mode: "help", keys: "<PageDown>", action: "help.pageDown" },
  { mode: "help", keys: "<Space>", action: "help.pageDown" },
  { mode: "help", keys: "<C-u>", action: "help.pageUp" },
  { mode: "help", keys: "<C-b>", action: "help.pageUp" },
  { mode: "help", keys: "<PageUp>", action: "help.pageUp" },
  { mode: "help", keys: "gg", action: "help.top" },
  { mode: "help", keys: "<Home>", action: "help.top" },
  { mode: "help", keys: "G", action: "help.bottom" },
  { mode: "help", keys: "<End>", action: "help.bottom" },
  { mode: "help", keys: "?", action: "help.close" },
  { mode: "help", keys: "q", action: "help.close" },
  { mode: "help", keys: "<Esc>", action: "help.close" },
  { mode: "help", keys: "<C-c>", action: "help.close" },
];
