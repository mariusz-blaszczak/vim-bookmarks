import type { BNode } from "../shared/types";

const bm = (id: string, title = id): BNode => ({ id, title, kind: "bookmark", url: `https://${id}.test/` });
const folder = (id: string, children: BNode[], title = id): BNode => ({ id, title, kind: "folder", children });

/**
 *  bar/        gh, dev/{mdn, rust}, news
 *  other/      misc
 */
export const sample: BNode[] = [
  folder("bar", [bm("gh"), folder("dev", [bm("mdn"), bm("rust")]), bm("news")]),
  folder("other", [bm("misc")]),
];
