import { describe, expect, it } from "vitest";
import { normalize } from "./bookmarks";

describe("normalize", () => {
  it("handles Chrome nodes (kind inferred from url) and root roles by id", () => {
    const n = normalize(
      {
        id: "1",
        title: "Bookmarks bar",
        syncing: false,
        children: [{ id: "10", parentId: "1", title: "GitHub", url: "https://github.com", syncing: false }],
      },
      true,
    );
    expect(n).toEqual({
      id: "1",
      title: "Bookmarks bar",
      kind: "folder",
      role: "toolbar",
      children: [{ id: "10", parentId: "1", title: "GitHub", kind: "bookmark", url: "https://github.com" }],
    });
  });

  it("prefers Chrome folderType over id", () => {
    const n = normalize({ id: "99", title: "Other", folderType: "other", children: [], syncing: false } as never, true);
    expect(n.role).toBe("other");
  });

  it("handles Firefox separators and folders by type", () => {
    const n = normalize(
      {
        id: "menu________",
        title: "Bookmarks Menu",
        type: "folder",
        children: [{ id: "s1", title: "", type: "separator", url: "data:" }],
      } as never,
      true,
    );
    expect(n.role).toBe("menu");
    expect(n.children).toEqual([{ id: "s1", title: "", kind: "separator" }]);
  });

  it("only assigns roles to top-level folders", () => {
    const n = normalize({ id: "1", title: "nested", children: [], syncing: false });
    expect(n.role).toBeUndefined();
  });
});
