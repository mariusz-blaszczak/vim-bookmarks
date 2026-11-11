import { describe, expect, it } from "vitest";
import { FakeBookmarks, type Spec } from "./fake-bookmarks";
import { BookmarkOps } from "./ops";

const bm = (id: string): Spec => ({ id, url: `https://${id}.test/` });
const spec = (): Spec[] => [
  { id: "bar", children: [bm("a"), bm("b"), bm("c"), { id: "dev", children: [bm("x"), bm("y")] }] },
  { id: "other", children: [bm("o"), { id: "managed", locked: true, children: [bm("m")] }] },
];

for (const semantics of ["before-removal", "final"] as const) {
  describe(`BookmarkOps (move index: ${semantics})`, () => {
    const setup = () => {
      const fake = new FakeBookmarks(spec(), semantics);
      return { fake, ops: new BookmarkOps(fake) };
    };

    it("moves down within the same folder", async () => {
      const { fake, ops } = setup();
      await ops.move(["a"], { parentId: "bar", afterId: "c" });
      expect(fake.dump("bar")[0]).toBe("bar: b, c, a, dev");
    });

    it("moves up within the same folder and to the first slot", async () => {
      const { fake, ops } = setup();
      await ops.move(["c"], { parentId: "bar", afterId: "a" });
      expect(fake.dump("bar")[0]).toBe("bar: a, c, b, dev");
      await ops.move(["dev"], { parentId: "bar", afterId: null });
      expect(fake.dump("bar")[0]).toBe("bar: dev, a, c, b");
    });

    it("moves several items in order across folders", async () => {
      const { fake, ops } = setup();
      await ops.move(["a", "c"], { parentId: "dev", afterId: "x" });
      expect(fake.dump("bar")).toEqual(["bar: b, dev", "dev: x, a, c, y"]);
    });

    it("moves several items within one folder keeping their order", async () => {
      const { fake, ops } = setup();
      await ops.move(["a", "b"], { parentId: "bar", afterId: "dev" });
      expect(fake.dump("bar")[0]).toBe("bar: c, dev, a, b");
    });

    it("treats moving after itself as a no-op", async () => {
      const { fake, ops } = setup();
      await ops.move(["b"], { parentId: "bar", afterId: "b" });
      expect(fake.dump("bar")[0]).toBe("bar: a, b, c, dev");
    });
  });
}

describe("BookmarkOps guards and copies", () => {
  const setup = () => {
    const fake = new FakeBookmarks(spec());
    return { fake, ops: new BookmarkOps(fake) };
  };

  it("refuses to move a folder into itself or its descendants", async () => {
    const { ops } = setup();
    await expect(ops.move(["dev"], { parentId: "dev", afterId: null })).rejects.toThrow("into itself");
    await expect(ops.move(["bar"], { parentId: "dev", afterId: null })).rejects.toThrow();
  });

  it("protects built-in and managed folders", async () => {
    const { ops } = setup();
    await expect(ops.remove("bar")).rejects.toThrow("Built-in");
    await expect(ops.update("other", { title: "x" })).rejects.toThrow("Built-in");
    await expect(ops.remove("managed")).rejects.toThrow("Managed");
    await expect(ops.create({ parentId: "managed", afterId: null }, { title: "t" })).rejects.toThrow("Managed");
    await expect(ops.create({ parentId: "0", afterId: null }, { title: "t" })).rejects.toThrow("top level");
    await expect(ops.create({ parentId: "a", afterId: null }, { title: "t" })).rejects.toThrow("not a folder");
  });

  it("creates after a sibling or first", async () => {
    const { fake, ops } = setup();
    const id1 = await ops.create({ parentId: "bar", afterId: "b" }, { title: "new", url: "https://n.test/" });
    const id2 = await ops.create({ parentId: "bar", afterId: null }, { title: "dir" });
    expect(fake.dump("bar")[0]).toBe(`bar: ${id2}, a, b, ${id1}, c, dev`);
  });

  it("removes bookmarks and whole folders", async () => {
    const { fake, ops } = setup();
    await ops.remove("a");
    await ops.remove("dev");
    expect(fake.dump("bar")).toEqual(["bar: b, c"]);
  });

  it("deep-copies folders, including into themselves", async () => {
    const { fake, ops } = setup();
    const [copy] = await ops.copy(["dev"], { parentId: "dev", afterId: "y" });
    const dump = fake.dump("dev");
    expect(dump[0]).toBe(`dev: x, y, ${copy}`);
    expect(dump[1]).toMatch(new RegExp(`^${copy}: \\d+, \\d+$`));
  });

  it("copies several items after the anchor, in order", async () => {
    const { fake, ops } = setup();
    const ids = await ops.copy(["a", "b"], { parentId: "other", afterId: "o" });
    expect(fake.dump("other")[0]).toBe(`other: o, ${ids[0]}, ${ids[1]}, managed`);
  });

  it("reports nodes that disappeared", async () => {
    const { ops } = setup();
    await expect(ops.update("nope", { title: "x" })).rejects.toThrow("no longer exists");
  });
});
