import type { Target } from "../shared/types";

/** The subset of the bookmarks API we use, so tests can supply a fake. */
export interface RawNode {
  id: string;
  parentId?: string;
  index?: number;
  title: string;
  url?: string;
  type?: "bookmark" | "folder" | "separator";
  unmodifiable?: string;
  children?: RawNode[];
}

export interface BookmarksApi {
  getTree(): Promise<RawNode[]>;
  get(id: string): Promise<RawNode[]>;
  getChildren(id: string): Promise<RawNode[]>;
  getSubTree(id: string): Promise<RawNode[]>;
  create(details: { parentId: string; index: number; title?: string; url?: string; type?: "separator" }): Promise<RawNode>;
  update(id: string, changes: { title?: string; url?: string }): Promise<RawNode>;
  move(id: string, dest: { parentId: string; index: number }): Promise<RawNode>;
  remove(id: string): Promise<void>;
  removeTree(id: string): Promise<void>;
}

const isFolder = (n: RawNode): boolean => (n.type ? n.type === "folder" : n.url === undefined);

/**
 * Mutations with the guards and cross-browser quirks handled in one place:
 * built-in/managed folders are protected, positions are given relative to a
 * sibling, and moves are verified because Chrome and Firefox may interpret
 * a same-folder move index differently.
 */
export class BookmarkOps {
  private rootIdCache: string | undefined;

  constructor(private readonly b: BookmarksApi) {}

  async create(target: Target, details: { title: string; url?: string }): Promise<string> {
    await this.assertContainer(target.parentId);
    const index = await this.indexAfter(target.parentId, target.afterId, new Set());
    const node = await this.b.create({
      parentId: target.parentId,
      index,
      title: details.title,
      ...(details.url !== undefined ? { url: details.url } : {}),
    });
    return node.id;
  }

  async update(id: string, changes: { title?: string; url?: string }): Promise<void> {
    await this.assertEditable(id);
    await this.b.update(id, changes);
  }

  async remove(id: string): Promise<void> {
    const node = await this.assertEditable(id);
    if (isFolder(node)) await this.b.removeTree(id);
    else await this.b.remove(id);
  }

  async move(ids: readonly string[], target: Target): Promise<void> {
    await this.assertContainer(target.parentId);
    for (const id of ids) {
      await this.assertEditable(id);
      if (await this.isSelfOrAncestor(id, target.parentId)) {
        throw new Error("Can't move a folder into itself");
      }
    }
    let after = target.afterId;
    for (const id of ids) {
      if (id !== after) {
        const finalIndex = await this.indexAfter(target.parentId, after, new Set([id]));
        await this.placeAt(id, target.parentId, finalIndex);
      }
      after = id;
    }
  }

  async copy(ids: readonly string[], target: Target): Promise<string[]> {
    await this.assertContainer(target.parentId);
    // Snapshot first, so copying a folder into itself doesn't recurse forever.
    const trees = await Promise.all(ids.map(async (id) => (await this.b.getSubTree(id))[0]));
    const out: string[] = [];
    let after = target.afterId;
    for (const tree of trees) {
      if (!tree) throw new Error("Bookmark no longer exists");
      const index = await this.indexAfter(target.parentId, after, new Set());
      const id = await this.clone(tree, target.parentId, index);
      out.push(id);
      after = id;
    }
    return out;
  }

  // ---- internals -----------------------------------------------------------

  private async rootId(): Promise<string> {
    if (this.rootIdCache === undefined) {
      const [root] = await this.b.getTree();
      if (!root) throw new Error("Bookmark tree is empty");
      this.rootIdCache = root.id;
    }
    return this.rootIdCache;
  }

  private async getNode(id: string): Promise<RawNode> {
    const [node] = await this.b.get(id).catch(() => []);
    if (!node) throw new Error("Bookmark no longer exists");
    return node;
  }

  private async assertEditable(id: string): Promise<RawNode> {
    const node = await this.getNode(id);
    if (node.parentId === undefined || node.parentId === (await this.rootId())) {
      throw new Error("Built-in folders can't be changed");
    }
    if (node.unmodifiable) throw new Error("Managed bookmarks can't be changed");
    return node;
  }

  private async assertContainer(parentId: string): Promise<void> {
    if (parentId === (await this.rootId())) throw new Error("Can't add items at the top level");
    const parent = await this.getNode(parentId);
    if (!isFolder(parent)) throw new Error("Target is not a folder");
    if (parent.unmodifiable) throw new Error("Managed bookmarks can't be changed");
  }

  /** Final index for an item placed after `afterId`, ignoring `exclude`d children. */
  private async indexAfter(parentId: string, afterId: string | null, exclude: ReadonlySet<string>): Promise<number> {
    if (afterId === null) return 0;
    const kids = (await this.b.getChildren(parentId)).filter((k) => !exclude.has(k.id));
    const i = kids.findIndex((k) => k.id === afterId);
    return i < 0 ? kids.length : i + 1;
  }

  private async isSelfOrAncestor(id: string, of: string): Promise<boolean> {
    for (let cur: string | undefined = of; cur !== undefined; ) {
      if (cur === id) return true;
      const [n]: RawNode[] = await this.b.get(cur).catch(() => []);
      cur = n?.parentId;
    }
    return false;
  }

  /** Move so the node ends at `finalIndex` among its new siblings. */
  private async placeAt(id: string, parentId: string, finalIndex: number): Promise<void> {
    const node = await this.getNode(id);
    const sameParent = node.parentId === parentId;
    if (sameParent && node.index === finalIndex) return;
    // Chrome counts the index before removing the node from its old slot.
    const first = sameParent && (node.index ?? 0) < finalIndex ? finalIndex + 1 : finalIndex;
    await this.b.move(id, { parentId, index: first });
    const moved = await this.getNode(id);
    if (moved.parentId !== parentId || moved.index !== finalIndex) {
      await this.b.move(id, { parentId, index: finalIndex });
    }
  }

  private async clone(node: RawNode, parentId: string, index: number): Promise<string> {
    if (node.type === "separator") {
      return (await this.b.create({ parentId, index, type: "separator" })).id;
    }
    if (!isFolder(node)) {
      return (await this.b.create({ parentId, index, title: node.title, ...(node.url ? { url: node.url } : {}) })).id;
    }
    const folder = await this.b.create({ parentId, index, title: node.title });
    for (const [i, child] of (node.children ?? []).entries()) {
      await this.clone(child, folder.id, i);
    }
    return folder.id;
  }
}
