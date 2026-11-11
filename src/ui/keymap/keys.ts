/**
 * Key tokens use Vim notation: printable keys are themselves ("j", "G", "/"),
 * everything else is bracketed ("<CR>", "<C-d>", "<S-Tab>"). Modifier order is
 * always C, A, D (Cmd/Meta), S. Shift is only spelled out for named keys and
 * for letters combined with other modifiers; otherwise it is in the character.
 */

export interface KeyLike {
  key: string;
  code?: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  isComposing?: boolean;
}

const NAMED: Record<string, string> = {
  Enter: "CR",
  Escape: "Esc",
  Tab: "Tab",
  Backspace: "BS",
  Delete: "Del",
  Insert: "Insert",
  " ": "Space",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Home: "Home",
  End: "End",
};
for (let i = 1; i <= 12; i++) NAMED[`F${i}`] = `F${i}`;

const CANONICAL = new Map<string, string>(Object.values(NAMED).map((n) => [n.toLowerCase(), n]));
CANONICAL.set("enter", "CR");
CANONICAL.set("return", "CR");
CANONICAL.set("escape", "Esc");
CANONICAL.set("backspace", "BS");
CANONICAL.set("delete", "Del");
CANONICAL.set("lt", "<");

const IGNORED = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "AltGraph", "Dead", "Unidentified", "OS", "Fn"]);

function build(base: string, mods: { c?: boolean; a?: boolean; d?: boolean; s?: boolean }, named: boolean): string {
  const prefix = (mods.c ? "C-" : "") + (mods.a ? "A-" : "") + (mods.d ? "D-" : "") + (mods.s ? "S-" : "");
  if (prefix) return `<${prefix}${base}>`;
  return named ? `<${base}>` : base;
}

export function eventToToken(e: KeyLike): string | null {
  if (e.isComposing || IGNORED.has(e.key)) return null;

  const named = NAMED[e.key];
  if (named) {
    return build(named, { c: e.ctrlKey, a: e.altKey, d: e.metaKey, s: e.shiftKey }, true);
  }
  if ([...e.key].length !== 1) return null;

  let base = e.key;
  // macOS Option+letter produces "∂" etc.; recover the physical key.
  if (e.altKey && e.code) {
    const letter = /^Key([A-Z])$/.exec(e.code)?.[1];
    const digit = /^Digit(\d)$/.exec(e.code)?.[1];
    if (letter) base = e.shiftKey ? letter : letter.toLowerCase();
    else if (digit) base = digit;
  }

  const modified = e.ctrlKey || e.altKey || e.metaKey;
  if (!modified) return base === "<" ? "<lt>" : base;

  let shift = false;
  if (/^[a-zA-Z]$/.test(base)) {
    shift = e.shiftKey;
    base = base.toLowerCase();
  }
  return build(base, { c: e.ctrlKey, a: e.altKey, d: e.metaKey, s: shift }, false);
}

/** Parse a key spec like "gg", "<C-d>", "<lt>a" into tokens. */
export function parseKeys(spec: string): string[] {
  const out: string[] = [];
  for (const m of spec.matchAll(/<([^<>\s]+)>|([\s\S])/gu)) {
    if (m[1] !== undefined) {
      const token = normalizeBracketed(m[1]);
      if (token) out.push(token);
      else out.push("<lt>", ...m[0].slice(1));
    } else if (m[2] !== undefined) {
      out.push(m[2] === "<" ? "<lt>" : m[2]);
    }
  }
  return out;
}

function normalizeBracketed(inner: string): string | null {
  const parts = inner.split("-");
  let key = parts.pop() ?? "";
  if (key === "" && parts.length > 0) {
    // "<C-->" → key "-"
    parts.pop();
    key = "-";
  }
  const mods = { c: false, a: false, d: false, s: false };
  for (const p of parts) {
    switch (p.toUpperCase()) {
      case "C": mods.c = true; break;
      case "A":
      case "M": mods.a = true; break;
      case "D": mods.d = true; break;
      case "S": mods.s = true; break;
      default: return null;
    }
  }

  const named = CANONICAL.get(key.toLowerCase());
  if (named === "<") return mods.c || mods.a || mods.d ? build("<", mods, false) : "<lt>";
  if (named) return build(named, mods, true);
  if ([...key].length !== 1) return null;

  const modified = mods.c || mods.a || mods.d;
  if (!modified) return mods.s ? key.toUpperCase() : key;
  // Like Vim, <C-D> means <C-d>; shift must be explicit (<C-S-d>).
  return build(/^[a-zA-Z]$/.test(key) ? key.toLowerCase() : key, mods, false);
}
