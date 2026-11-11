// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { BNode } from "../shared/types";
import { iconKind, renderIcon, urlIcon } from "./icons";

describe("icons", () => {
  it("classifies bookmark URLs", () => {
    expect(urlIcon("https://example.com/")).toBe("page");
    expect(urlIcon("https://w3.org/spec.PDF?x=1")).toBe("pdf");
    expect(urlIcon("javascript:void(0)")).toBe("script");
    expect(urlIcon("chrome://extensions/")).toBe("internal");
    expect(urlIcon("about:config")).toBe("internal");
    expect(urlIcon("file:///tmp/a.pdf")).toBe("internal");
    expect(urlIcon("place:sort=8")).toBe("internal");
    expect(urlIcon(undefined)).toBe("page");
  });

  it("picks folder icons by role, lock and state", () => {
    const f = (extra: Partial<BNode>): BNode => ({ id: "1", title: "f", kind: "folder", ...extra });
    expect(iconKind(f({ role: "toolbar" }), true)).toBe("toolbar");
    expect(iconKind(f({ role: "other" }), false)).toBe("folder");
    expect(iconKind(f({ locked: true }), true)).toBe("managed");
    expect(iconKind(f({}), true)).toBe("folderOpen");
    expect(iconKind({ id: "s", title: "", kind: "separator" }, false)).toBeNull();
  });

  it("renders independent SVG copies colored by class", () => {
    const node: BNode = { id: "b", title: "b", kind: "bookmark", url: "https://a.test/" };
    const a = renderIcon(node, false);
    const b = renderIcon(node, false);
    expect(a).not.toBe(b);
    expect(a.getAttribute("class")).toBe("vb-icon vb-icon-page");
    expect(a.querySelectorAll("circle, ellipse, path")).toHaveLength(3);
  });
});
