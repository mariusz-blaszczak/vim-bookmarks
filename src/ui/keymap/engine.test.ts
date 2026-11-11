import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeyEngine, type Binding, type Match } from "./engine";
import { parseKeys } from "./keys";

function setup(bindings: Binding[]) {
  const fired: Match[] = [];
  const engine = new KeyEngine(bindings, (m) => fired.push(m), 1000);
  const type = (spec: string) => parseKeys(spec).map((t) => engine.feed(t));
  return { engine, fired, type };
}

describe("KeyEngine", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires single-key bindings immediately", () => {
    const { fired, type } = setup([{ keys: "j", action: "down" }]);
    expect(type("j")).toEqual([true]);
    expect(fired).toEqual([{ action: "down", count: null }]);
  });

  it("waits for multi-key sequences and shows them as pending", () => {
    const { engine, fired, type } = setup([{ keys: "gg", action: "top" }]);
    type("g");
    expect(fired).toEqual([]);
    expect(engine.pending).toBe("g");
    type("g");
    expect(fired).toEqual([{ action: "top", count: null }]);
    expect(engine.pending).toBe("");
  });

  it("collects counts, but a leading 0 is not a count", () => {
    const { fired, type } = setup([{ keys: "j", action: "down" }, { keys: "G", action: "last" }]);
    type("12j");
    type("3G");
    expect(fired).toEqual([
      { action: "down", count: 12 },
      { action: "last", count: 3 },
    ]);
    expect(type("0")).toEqual([false]);
  });

  it("discards a broken sequence and reports it as consumed", () => {
    const { engine, fired, type } = setup([{ keys: "gg", action: "top" }]);
    expect(type("gx")).toEqual([true, true]);
    expect(fired).toEqual([]);
    expect(engine.pending).toBe("");
  });

  it("does not consume unbound keys when nothing is pending", () => {
    const { type } = setup([{ keys: "j", action: "down" }]);
    expect(type("x")).toEqual([false]);
  });

  it("<Esc> cancels pending input instead of firing its binding", () => {
    const { fired, type } = setup([
      { keys: "gg", action: "top" },
      { keys: "<Esc>", action: "close" },
    ]);
    type("5g<Esc>");
    expect(fired).toEqual([]);
    type("<Esc>");
    expect(fired).toEqual([{ action: "close", count: null }]);
  });

  it("resolves an ambiguous prefix after the timeout", () => {
    const { fired, type } = setup([
      { keys: "d", action: "short" },
      { keys: "dd", action: "long" },
    ]);
    type("d");
    expect(fired).toEqual([]);
    vi.advanceTimersByTime(1000);
    expect(fired).toEqual([{ action: "short", count: null }]);

    type("dd");
    expect(fired.at(-1)).toEqual({ action: "long", count: null });
  });

  it("later bindings override earlier ones; nop unbinds", () => {
    const { fired, type } = setup([
      { keys: "j", action: "down" },
      { keys: "k", action: "up" },
      { keys: "j", action: "custom" },
      { keys: "k", action: "nop" },
    ]);
    type("j");
    expect(type("k")).toEqual([false]);
    expect(fired).toEqual([{ action: "custom", count: null }]);
  });
});
