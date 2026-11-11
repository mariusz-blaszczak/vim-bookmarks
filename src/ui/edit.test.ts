import { describe, expect, it, vi } from "vitest";
import type { Request, Send } from "../shared/protocol";
import { createEditor, normalizeUrl, type EditHost } from "./edit";
import { sample } from "./test-fixtures";
import { flatten, indexTree } from "./tree";

function setup(cursorId: string, answers: { prompt?: (string | null)[]; confirm?: boolean[] } = {}) {
  const index = indexTree(sample);
  const rows = flatten(sample, new Set(["bar", "dev"]));
  const requests: Request[] = [];
  const messages: [string, boolean][] = [];
  const prompts: { label: string; value?: string }[] = [];
  const reloads: (string | undefined)[] = [];
  const send = vi.fn(async (req: Request) => {
    requests.push(req);
    if (req.type === "create") return "new1";
    if (req.type === "copy") return req.ids.map((_, i) => `copy${i}`);
    return null;
  }) as unknown as Send;

  const host: EditHost = {
    row: rows.find((r) => r.node.id === cursorId),
    index,
    register: null,
    currentPage: async () => ({ url: "https://page.test/", title: "Page" }),
    prompt: async (o) => {
      prompts.push(o);
      return answers.prompt?.shift() ?? null;
    },
    confirm: async () => answers.confirm?.shift() ?? false,
    message: (t, e = false) => messages.push([t, e]),
    reload: async (id) => void reloads.push(id),
  };
  return { host, editor: createEditor(host, send), requests, messages, prompts, reloads };
}

describe("normalizeUrl", () => {
  it("adds https:// when no scheme is given", () => {
    expect(normalizeUrl(" example.com/x ")).toBe("https://example.com/x");
    expect(normalizeUrl("http://a.b")).toBe("http://a.b");
    expect(normalizeUrl("javascript:void(0)")).toBe("javascript:void(0)");
  });
  it("rejects empty and unparseable input", () => {
    expect(normalizeUrl("  ")).toBeNull();
    expect(normalizeUrl("http://")).toBeNull();
  });
});

describe("editor", () => {
  it("adds the current page after the cursor with the edited title", async () => {
    const t = setup("gh", { prompt: ["My page"] });
    await t.editor.addBookmark();
    expect(t.prompts[0]).toMatchObject({ label: "Add bookmark: ", value: "Page" });
    expect(t.requests).toEqual([
      { type: "create", target: { parentId: "bar", afterId: "gh" }, title: "My page", url: "https://page.test/" },
    ]);
    expect(t.reloads).toEqual(["new1"]);
  });

  it("does nothing when a prompt is cancelled", async () => {
    const t = setup("gh", { prompt: [null] });
    await t.editor.addFolder();
    await t.editor.rename();
    expect(t.requests).toEqual([]);
  });

  it("creates a folder first inside an open folder", async () => {
    const t = setup("dev", { prompt: ["  New  "] });
    await t.editor.addFolder();
    expect(t.requests).toEqual([{ type: "create", target: { parentId: "dev", afterId: null }, title: "New" }]);
  });

  it("renames and edits URLs, normalizing them", async () => {
    const t = setup("mdn", { prompt: ["MDN docs", "developer.mozilla.org"] });
    await t.editor.rename();
    await t.editor.editUrl();
    expect(t.requests).toEqual([
      { type: "update", id: "mdn", title: "MDN docs" },
      { type: "update", id: "mdn", url: "https://developer.mozilla.org" },
    ]);
  });

  it("rejects an invalid URL without sending", async () => {
    const t = setup("mdn", { prompt: ["http://"] });
    await t.editor.editUrl();
    expect(t.requests).toEqual([]);
    expect(t.messages.at(-1)).toEqual(["Invalid URL: http://", true]);
  });

  it("refuses to change built-in folders", async () => {
    const t = setup("bar");
    t.editor.cut();
    await t.editor.remove();
    expect(t.host.register).toBeNull();
    expect(t.requests).toEqual([]);
    expect(t.messages[0]).toEqual(["Built-in folders can't be changed", true]);
  });

  it("cut + paste moves and clears the register", async () => {
    const t = setup("gh");
    t.editor.cut();
    expect(t.host.register).toEqual({ op: "cut", ids: ["gh"] });
    (t.host as { row: unknown }).row = flatten(sample, new Set(["bar", "dev"])).find((r) => r.node.id === "rust");
    await t.editor.paste("after");
    expect(t.requests).toEqual([{ type: "move", ids: ["gh"], target: { parentId: "dev", afterId: "rust" } }]);
    expect(t.host.register).toBeNull();
    expect(t.reloads).toEqual(["gh"]);
  });

  it("yank + paste copies and keeps the register for repeated pastes", async () => {
    const t = setup("gh");
    t.editor.yank();
    await t.editor.paste("before");
    await t.editor.paste("before");
    expect(t.requests).toHaveLength(2);
    expect(t.requests[0]).toEqual({ type: "copy", ids: ["gh"], target: { parentId: "bar", afterId: null } });
    expect(t.host.register).toEqual({ op: "copy", ids: ["gh"] });
    expect(t.messages.at(-1)).toEqual(["Pasted 1 copy", false]);
  });

  it("paste with an empty register is an error", async () => {
    const t = setup("gh");
    await t.editor.paste("after");
    expect(t.messages[0]?.[1]).toBe(true);
  });

  it("asks before deleting a non-empty folder", async () => {
    const t = setup("dev", { confirm: [false, true] });
    await t.editor.remove();
    expect(t.requests).toEqual([]);
    await t.editor.remove();
    expect(t.requests).toEqual([{ type: "remove", id: "dev" }]);
    expect(t.messages.at(-1)).toEqual(['Deleted "dev"', false]);
  });

  it("deletes bookmarks without asking and drops them from the register", async () => {
    const t = setup("gh");
    t.editor.cut();
    await t.editor.remove();
    expect(t.requests).toEqual([{ type: "remove", id: "gh" }]);
    expect(t.host.register).toBeNull();
  });

  it("reports background errors", async () => {
    const t = setup("gh");
    const failing = createEditor(
      { ...t.host, prompt: async () => "x" },
      (async () => {
        throw new Error("Bookmark no longer exists");
      }) as Send,
    );
    await failing.rename();
    expect(t.messages.at(-1)).toEqual(["Bookmark no longer exists", true]);
  });
});
