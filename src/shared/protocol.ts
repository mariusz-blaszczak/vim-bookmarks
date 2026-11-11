import { api } from "./api";
import type { BNode, PageInfo, Target } from "./types";

export type OpenWhere = "current" | "newTab" | "background" | "newWindow";

export type Request =
  | { type: "getTree" }
  | { type: "open"; url: string; where: OpenWhere }
  | { type: "currentPage" }
  | { type: "create"; target: Target; title: string; url?: string }
  | { type: "update"; id: string; title?: string; url?: string }
  | { type: "remove"; id: string }
  | { type: "move"; ids: string[]; target: Target }
  | { type: "copy"; ids: string[]; target: Target };

export interface ResponseMap {
  getTree: BNode[];
  open: null;
  currentPage: PageInfo | null;
  create: string;
  update: null;
  remove: null;
  move: null;
  copy: string[];
}

export type Response<T extends Request["type"] = Request["type"]> =
  | { ok: true; value: ResponseMap[T] }
  | { ok: false; error: string };

export type Send = <R extends Request>(req: R) => Promise<ResponseMap[R["type"]]>;

/** Send a request to the background script and unwrap its response. */
export const send: Send = async (req) => {
  const res = (await api.runtime.sendMessage(req)) as Response | undefined;
  if (!res) throw new Error("No response from background");
  if (!res.ok) throw new Error(res.error);
  return res.value as never;
};

export const CHANGES_PORT = "vb-changes";

/**
 * Call `onChange` whenever bookmarks change anywhere (other windows, sync,
 * our own edits). Reconnects if the background restarts. Returns unsubscribe.
 */
export function subscribeChanges(onChange: () => void): () => void {
  let port: chrome.runtime.Port | null = null;
  let stopped = false;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const connect = (): void => {
    try {
      port = api.runtime.connect({ name: CHANGES_PORT });
    } catch {
      return; // extension context gone (reloaded); nothing to do
    }
    port.onMessage.addListener(onChange);
    port.onDisconnect.addListener(() => {
      port = null;
      if (!stopped) retry = setTimeout(connect, 1000);
    });
  };
  connect();

  return () => {
    stopped = true;
    clearTimeout(retry);
    port?.disconnect();
  };
}
