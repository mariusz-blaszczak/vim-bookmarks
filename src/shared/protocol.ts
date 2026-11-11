import { api } from "./api";
import type { BNode } from "./types";

export type OpenWhere = "current" | "newTab" | "background" | "newWindow";

export type Request =
  | { type: "getTree" }
  | { type: "open"; url: string; where: OpenWhere };

export interface ResponseMap {
  getTree: BNode[];
  open: null;
}

export type Response<T extends Request["type"] = Request["type"]> =
  | { ok: true; value: ResponseMap[T] }
  | { ok: false; error: string };

/** Send a request to the background script and unwrap its response. */
export async function send<R extends Request>(req: R): Promise<ResponseMap[R["type"]]> {
  const res = (await api.runtime.sendMessage(req)) as Response<R["type"]> | undefined;
  if (!res) throw new Error("No response from background");
  if (!res.ok) throw new Error(res.error);
  return res.value;
}
