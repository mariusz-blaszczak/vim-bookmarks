import type { BookmarksApi, RawNode } from "./ops";

/**
 * In-memory bookmarks API for tests. `moveSemantics` models the two possible
 * readings of `move` index within the same folder:
 *  - "before-removal": index counts the node's old slot (Chrome)
 *  - "final": index is the node's position after the move
 */
export class FakeBookmarks implements BookmarksApi {
  private nodes = new Map<string, RawNode & { children?: RawNode[] }>();
  private nextId = 100;
  readonly calls: string[] = [];

  constructor(
    spec: Spec[],
    private readonly moveSemantics: "before-removal" | "final" = "before-removal",
    rootId = "0",
  ) {
    const root: RawNode = { id: rootId, title: "", children: [] };
    this.nodes.set(rootId, root);
    spec.forEach((s, i) => this.build(s, root, i));
  }

  private build(s: Spec, parent: RawNode, index: number): void {
    const node: RawNode = { id: s.id, parentId: parent.id, index, title: s.title ?? s.id };
    if (s.url !== undefined) node.url = s.url;
    if (s.separator) node.type = "separator";
    if (s.locked) node.unmodifiable = "managed";
    this.nodes.set(node.id, node);
    parent.children!.push(node);
    if (s.children) {
      node.children = [];
      s.children.forEach((c, i) => this.build(c, node, i));
    }
  }

  private reindex(parent: RawNode): void {
    parent.children!.forEach((c, i) => (c.index = i));
  }

  private snapshot(n: RawNode): RawNode {
    const { children, ...rest } = n;
    return children ? { ...rest, children: children.map((c) => this.snapshot(c)) } : { ...rest };
  }

  private must(id: string): RawNode {
    const n = this.nodes.get(id);
    if (!n) throw new Error(`No node ${id}`);
    return n;
  }

  /** Compact view: "parent: a, b, c" lines, for assertions. */
  dump(id = "0"): string[] {
    const out: string[] = [];
    const walk = (n: RawNode): void => {
      if (!n.children) return;
      out.push(`${n.id}: ${n.children.map((c) => c.id).join(", ")}`);
      n.children.forEach(walk);
    };
    walk(this.must(id));
    return out;
  }

  async getTree() {
    return [this.snapshot(this.must("0"))];
  }
  async get(id: string) {
    const { children: _, ...n } = this.must(id);
    return [{ ...n }];
  }
  async getChildren(id: string) {
    return (this.must(id).children ?? []).map(({ children: _, ...n }) => ({ ...n }));
  }
  async getSubTree(id: string) {
    return [this.snapshot(this.must(id))];
  }
  async create(d: { parentId: string; index: number; title?: string; url?: string; type?: "separator" }) {
    this.calls.push(`create ${d.title ?? d.type}`);
    const parent = this.must(d.parentId);
    const node: RawNode = { id: String(this.nextId++), parentId: d.parentId, title: d.title ?? "" };
    if (d.url !== undefined) node.url = d.url;
    else if (d.type) node.type = d.type;
    else node.children = [];
    this.nodes.set(node.id, node);
    parent.children!.splice(Math.min(d.index, parent.children!.length), 0, node);
    this.reindex(parent);
    return { ...node };
  }
  async update(id: string, changes: { title?: string; url?: string }) {
    this.calls.push(`update ${id}`);
    Object.assign(this.must(id), changes);
    return { ...this.must(id) };
  }
  async move(id: string, dest: { parentId: string; index: number }) {
    this.calls.push(`move ${id} ${dest.parentId}@${dest.index}`);
    const node = this.must(id);
    const from = this.must(node.parentId!);
    const oldIndex = from.children!.indexOf(node);
    from.children!.splice(oldIndex, 1);
    this.reindex(from);
    const to = this.must(dest.parentId);
    let index = dest.index;
    if (this.moveSemantics === "before-removal" && from === to && oldIndex < index) index -= 1;
    to.children!.splice(Math.min(index, to.children!.length), 0, node);
    node.parentId = to.id;
    this.reindex(to);
    return { ...node };
  }
  async remove(id: string) {
    const n = this.must(id);
    if (n.children?.length) throw new Error("Can't remove non-empty folder");
    await this.removeTree(id);
  }
  async removeTree(id: string) {
    this.calls.push(`remove ${id}`);
    const n = this.must(id);
    const parent = this.must(n.parentId!);
    parent.children!.splice(parent.children!.indexOf(n), 1);
    this.reindex(parent);
    const drop = (x: RawNode): void => {
      this.nodes.delete(x.id);
      x.children?.forEach(drop);
    };
    drop(n);
  }
}

export interface Spec {
  id: string;
  title?: string;
  url?: string;
  separator?: boolean;
  locked?: boolean;
  children?: Spec[];
}
