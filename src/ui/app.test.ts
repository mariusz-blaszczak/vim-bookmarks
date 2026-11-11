// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sample } from "./test-fixtures";

const sent: unknown[] = [];
vi.mock("../shared/protocol", () => ({
  send: vi.fn(async (req: { type: string }) => {
    sent.push(req);
    return req.type === "getTree" ? structuredClone(sample) : null;
  }),
}));
vi.mock("./ui-state", () => ({
  loadUiState: vi.fn(async () => ({ expanded: ["bar"], cursorId: "bar" })),
  saveUiState: vi.fn(),
}));

const { mountApp } = await import("./app");

const KEY_NAMES: Record<string, string> = { CR: "Enter", Esc: "Escape", Tab: "Tab", Down: "ArrowDown", Up: "ArrowUp" };

async function setup() {
  const root = document.createElement("div");
  document.body.append(root);
  const onClose = vi.fn();
  const app = mountApp(root, { onClose, standalone: true });
  await vi.waitFor(() => expect(root.querySelector(".vb-row")).not.toBeNull());

  const q = <T extends Element>(sel: string) => root.querySelector<T>(sel)!;
  const press = (spec: string) => {
    for (const m of spec.matchAll(/<(C-)?(\w+)>|(.)/g)) {
      const key = m[3] ?? KEY_NAMES[m[2]!] ?? m[2]!;
      app.handleKey(new KeyboardEvent("keydown", { key, ctrlKey: Boolean(m[1]) }));
    }
  };
  const type = (text: string) => {
    const input = q<HTMLInputElement>(".vb-input");
    input.value = text;
    input.dispatchEvent(new Event("input"));
  };
  const rowIds = () =>
    [...root.querySelectorAll<HTMLElement>(".vb-row .vb-name")].map((n) => n.textContent);
  const cursorName = () => q(".vb-cursor .vb-name").textContent;
  const mode = () => q(".vb-mode").textContent;
  const cmd = () => q(".vb-cmdtext").textContent;
  return { app, root, onClose, press, type, rowIds, cursorName, mode, cmd, q };
}

describe("search in the app", () => {
  beforeEach(() => {
    sent.length = 0;
    document.body.replaceChildren();
  });
  afterEach(() => vi.useRealTimers());

  it("filters live while typing and jumps to the best match", async () => {
    const t = await setup();
    expect(t.rowIds()).toEqual(["bar", "gh", "dev", "news", "other"]);
    t.press("/");
    expect(t.mode()).toBe("SEARCH");
    t.type("rust");
    expect(t.rowIds()).toEqual(["bar", "dev", "rust"]);
    expect(t.cursorName()).toBe("rust");
    expect(t.q(".vb-cursor mark").textContent).toBe("rust");
    expect(t.q(".vb-cmdright").textContent).toBe("1 match");
  });

  it("<CR> keeps the filter, <Esc> drops it and reveals the match in the full tree", async () => {
    const t = await setup();
    t.press("/");
    t.type("mdn");
    t.press("<CR>");
    expect(t.mode()).toBe("NORMAL");
    expect(t.rowIds()).toEqual(["bar", "dev", "mdn"]);
    expect(t.cmd()).toBe("/mdn");

    t.press("<Esc>");
    expect(t.rowIds()).toEqual(["bar", "gh", "dev", "mdn", "rust", "news", "other"]);
    expect(t.cursorName()).toBe("mdn");
    expect(t.onClose).not.toHaveBeenCalled();

    t.press("<Esc>");
    expect(t.onClose).toHaveBeenCalledOnce();
  });

  it("<Esc> in the prompt restores the previous view", async () => {
    const t = await setup();
    t.press("j");
    t.press("/");
    t.type("misc");
    expect(t.rowIds()).toEqual(["other", "misc"]);
    t.press("<Esc>");
    expect(t.mode()).toBe("NORMAL");
    expect(t.rowIds()).toEqual(["bar", "gh", "dev", "news", "other"]);
    expect(t.cursorName()).toBe("gh");
  });

  it("accepting a query with no matches reports it and restores the view", async () => {
    const t = await setup();
    t.press("/");
    t.type("zzz");
    expect(t.rowIds()).toEqual([]);
    t.press("<CR>");
    expect(t.rowIds()).toEqual(["bar", "gh", "dev", "news", "other"]);
    expect(t.cmd()).toBe("Pattern not found: zzz");
    expect(t.q(".vb-cmdtext").classList.contains("vb-error")).toBe(true);
  });

  it("n/N cycle through matches in tree order with wrap-around", async () => {
    const t = await setup();
    t.press("/");
    t.type("test"); // every bookmark URL ends in .test
    t.press("<CR>");
    t.press("gg");
    t.press("n");
    expect(t.cursorName()).toBe("gh");
    t.press("n");
    expect(t.cursorName()).toBe("mdn");
    t.press("N");
    expect(t.cursorName()).toBe("gh");
    t.press("N");
    expect(t.cursorName()).toBe("misc");
    expect(t.cmd()).toBe("search hit TOP, continuing at BOTTOM");
    t.press("2n");
    expect(t.cursorName()).toBe("mdn");
  });

  it("<C-n>/<C-p> move between matches while the prompt stays open", async () => {
    const t = await setup();
    t.press("/");
    t.type("test");
    const first = t.cursorName();
    t.press("<C-n>");
    expect(t.cursorName()).not.toBe(first);
    t.press("<C-p>");
    expect(t.cursorName()).toBe(first);
    expect(t.mode()).toBe("SEARCH");
  });

  it("digits and letters typed in the prompt are not treated as commands", async () => {
    const t = await setup();
    t.press("/");
    const e = new KeyboardEvent("keydown", { key: "5" });
    expect(t.app.handleKey(e)).toBe(false);
    expect(t.app.handleKey(new KeyboardEvent("keydown", { key: "q" }))).toBe(false);
    expect(t.onClose).not.toHaveBeenCalled();
  });

  it("re-opening the prompt edits the current query", async () => {
    const t = await setup();
    t.press("/");
    t.type("rust");
    t.press("<CR>");
    t.press("/");
    expect(t.q<HTMLInputElement>(".vb-input").value).toBe("rust");
  });

  it("folds work inside the filtered view", async () => {
    const t = await setup();
    t.press("/");
    t.type("mdn");
    t.press("<CR>");
    t.press("gg");
    t.press("j"); // dev
    t.press("h");
    expect(t.rowIds()).toEqual(["bar", "dev"]);
    t.press("l");
    expect(t.rowIds()).toEqual(["bar", "dev", "mdn"]);
  });
});
