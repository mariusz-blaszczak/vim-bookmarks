import { describe, expect, it } from "vitest";
import type { BNode } from "../shared/types";
import { flattenFiltered, fuzzyMatch, matchNode, searchTree } from "./search";
import { sample } from "./test-fixtures";

describe("fuzzyMatch", () => {
  it("matches contiguous substrings case-insensitively", () => {
    expect(fuzzyMatch("hub", "GitHub")?.positions).toEqual([3, 4, 5]);
  });

  it("is case-sensitive when the term has uppercase (smart case)", () => {
    expect(fuzzyMatch("Hub", "github")).toBeNull();
    expect(fuzzyMatch("Hub", "GitHub")?.positions).toEqual([3, 4, 5]);
  });

  it("matches subsequences and picks the tightest window", () => {
    expect(fuzzyMatch("rdc", "Rust docs")?.positions).toEqual([0, 5, 7]);
    expect(fuzzyMatch("ab", "a-x-a-b")?.positions).toEqual([4, 6]);
    expect(fuzzyMatch("xyz", "abc")).toBeNull();
  });

  it("prefers word-boundary substrings over mid-word ones", () => {
    expect(fuzzyMatch("doc", "undocumented docs")?.positions).toEqual([13, 14, 15]);
  });

  it("scores contiguous above scattered", () => {
    const tight = fuzzyMatch("rust", "rust book")!.score;
    const loose = fuzzyMatch("rust", "r-u-s-t")!.score;
    expect(tight).toBeGreaterThan(loose);
  });
});

describe("matchNode", () => {
  const node: BNode = { id: "1", title: "Rust docs", kind: "bookmark", url: "https://doc.rust-lang.org/std" };

  it("requires every term, taking each from title or url", () => {
    const hit = matchNode(["rust", "std"], node)!;
    expect(hit.title).toEqual([0, 1, 2, 3]);
    expect(hit.url).toEqual([26, 27, 28]);
    expect(matchNode(["rust", "python"], node)).toBeNull();
  });

  it("never matches separators", () => {
    expect(matchNode(["a"], { id: "s", title: "a", kind: "separator" })).toBeNull();
  });
});

describe("searchTree + flattenFiltered", () => {
  it("returns hits, the best one, and an empty result for blank queries", () => {
    const r = searchTree(sample, "rust");
    expect([...r.hits.keys()]).toEqual(["rust"]);
    expect(r.bestId).toBe("rust");
    expect(searchTree(sample, "   ").hits.size).toBe(0);
  });

  it("shows hits with their ancestors, open unless collapsed", () => {
    const { hits } = searchTree(sample, "mdn");
    const rows = flattenFiltered(sample, hits, new Set());
    expect(rows.map((r) => [r.node.id, r.depth, r.open])).toEqual([
      ["bar", 0, true],
      ["dev", 1, true],
      ["mdn", 2, false],
    ]);
    expect(flattenFiltered(sample, hits, new Set(["dev"])).map((r) => r.node.id)).toEqual(["bar", "dev"]);
  });

  it("shows a matching folder closed when none of its children match", () => {
    const { hits } = searchTree(sample, "other");
    expect(flattenFiltered(sample, hits, new Set()).map((r) => [r.node.id, r.open])).toEqual([["other", false]]);
  });
});
