import { describe, expect, it } from "vitest";
import { eventToToken, parseKeys, type KeyLike } from "./keys";

const ev = (key: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  shiftKey: false,
  ...mods,
});

describe("eventToToken", () => {
  it("passes printable keys through, shift included in the character", () => {
    expect(eventToToken(ev("j"))).toBe("j");
    expect(eventToToken(ev("G", { shiftKey: true }))).toBe("G");
    expect(eventToToken(ev("/"))).toBe("/");
  });

  it("brackets named keys", () => {
    expect(eventToToken(ev("Enter"))).toBe("<CR>");
    expect(eventToToken(ev("Escape"))).toBe("<Esc>");
    expect(eventToToken(ev(" "))).toBe("<Space>");
    expect(eventToToken(ev("Tab", { shiftKey: true }))).toBe("<S-Tab>");
  });

  it("encodes modifiers in canonical order", () => {
    expect(eventToToken(ev("d", { ctrlKey: true }))).toBe("<C-d>");
    expect(eventToToken(ev("D", { ctrlKey: true, shiftKey: true }))).toBe("<C-S-d>");
    expect(eventToToken(ev("x", { ctrlKey: true, altKey: true, metaKey: true }))).toBe("<C-A-D-x>");
  });

  it("recovers the letter for macOS Option combos", () => {
    expect(eventToToken(ev("∂", { altKey: true, code: "KeyD" }))).toBe("<A-d>");
  });

  it("ignores bare modifiers, IME composition and unknown named keys", () => {
    expect(eventToToken(ev("Shift", { shiftKey: true }))).toBeNull();
    expect(eventToToken(ev("a", { isComposing: true }))).toBeNull();
    expect(eventToToken(ev("MediaPlayPause"))).toBeNull();
  });

  it("escapes a literal <", () => {
    expect(eventToToken(ev("<", { shiftKey: true }))).toBe("<lt>");
  });
});

describe("parseKeys", () => {
  it("splits plain sequences", () => {
    expect(parseKeys("gg")).toEqual(["g", "g"]);
    expect(parseKeys("zR")).toEqual(["z", "R"]);
  });

  it("normalizes bracketed keys like eventToToken", () => {
    expect(parseKeys("<cr>")).toEqual(["<CR>"]);
    expect(parseKeys("<c-D>")).toEqual(["<C-d>"]);
    expect(parseKeys("<s-c-a-x>")).toEqual(["<C-A-S-x>"]);
    expect(parseKeys("<M-x>")).toEqual(["<A-x>"]);
    expect(parseKeys("<S-a>")).toEqual(["A"]);
    expect(parseKeys("<C-->")).toEqual(["<C-->"]);
  });

  it("treats unparseable brackets and lone < literally", () => {
    expect(parseKeys("<foo>")).toEqual(["<lt>", "f", "o", "o", ">"]);
    expect(parseKeys("<lt>")).toEqual(["<lt>"]);
  });

  it("round-trips with eventToToken", () => {
    const pairs: [string, KeyLike][] = [
      ["<C-d>", ev("d", { ctrlKey: true })],
      ["<S-Tab>", ev("Tab", { shiftKey: true })],
      ["<Down>", ev("ArrowDown")],
      ["G", ev("G", { shiftKey: true })],
    ];
    for (const [spec, e] of pairs) expect(parseKeys(spec)).toEqual([eventToToken(e)]);
  });
});
