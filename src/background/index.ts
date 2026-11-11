import { api } from "../shared/api";
import { CHANGES_PORT, type Request, type Response, type ResponseMap } from "../shared/protocol";
import { getTree } from "./bookmarks";
import { currentPage, openUrl } from "./open";
import { BookmarkOps, type BookmarksApi } from "./ops";

const FALLBACK_WINDOW_KEY = "fallbackWindowId";

const ops = new BookmarkOps(api.bookmarks as unknown as BookmarksApi);

// ---- Requests from the UI ---------------------------------------------------

// sendResponse + `return true` rather than returning a Promise: works in both
// Chrome and Firefox regardless of version.
api.runtime.onMessage.addListener((msg: Request, sender, sendResponse: (r: Response) => void) => {
  handle(msg, sender).then(
    (value) => sendResponse({ ok: true, value }),
    (err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
  );
  return true;
});

async function handle(
  msg: Request,
  sender: chrome.runtime.MessageSender,
): Promise<ResponseMap[Request["type"]]> {
  switch (msg.type) {
    case "getTree":
      return getTree();
    case "open":
      await openUrl(msg.url, msg.where, sender);
      return null;
    case "currentPage":
      return currentPage(sender);
    case "create":
      return ops.create(msg.target, { title: msg.title, ...(msg.url !== undefined ? { url: msg.url } : {}) });
    case "update":
      await ops.update(msg.id, {
        ...(msg.title !== undefined ? { title: msg.title } : {}),
        ...(msg.url !== undefined ? { url: msg.url } : {}),
      });
      return null;
    case "remove":
      await ops.remove(msg.id);
      return null;
    case "move":
      await ops.move(msg.ids, msg.target);
      return null;
    case "copy":
      return ops.copy(msg.ids, msg.target);
    default:
      // A stale background (extension not reloaded after a rebuild) must not
      // silently "succeed" on requests it doesn't know.
      throw new Error(`Unknown request: ${(msg as { type?: unknown }).type} — reload the extension`);
  }
}

// ---- Change notifications ---------------------------------------------------

const ports = new Set<chrome.runtime.Port>();
let notifyTimer: ReturnType<typeof setTimeout> | undefined;

api.runtime.onConnect.addListener((port) => {
  if (port.name !== CHANGES_PORT) return;
  ports.add(port);
  port.onDisconnect.addListener(() => ports.delete(port));
});

/** Coalesce bursts (e.g. a folder copy fires one event per node). */
function notifyChanged(): void {
  clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => {
    for (const port of ports) {
      try {
        port.postMessage({ type: "changed" });
      } catch {
        ports.delete(port);
      }
    }
  }, 50);
}

api.bookmarks.onCreated.addListener(notifyChanged);
api.bookmarks.onRemoved.addListener(notifyChanged);
api.bookmarks.onChanged.addListener(notifyChanged);
api.bookmarks.onMoved.addListener(notifyChanged);
// Not available in Firefox.
api.bookmarks.onChildrenReordered?.addListener(notifyChanged);

// ---- Toggle: overlay or fallback window -------------------------------------

api.commands.onCommand.addListener((command, tab) => {
  if (command === "toggle-overlay") void toggle(tab);
});

api.action.onClicked.addListener((tab) => void toggle(tab));

api.windows.onRemoved.addListener(async (windowId) => {
  if ((await getFallbackWindowId()) === windowId) {
    await api.storage.session.remove(FALLBACK_WINDOW_KEY);
  }
});

async function toggle(tab?: chrome.tabs.Tab): Promise<void> {
  if (await closeFallbackIfFocused()) return;

  const target = tab ?? (await api.tabs.query({ active: true, currentWindow: true }))[0];
  if (target?.id !== undefined) {
    try {
      // content.js is idempotent: first run mounts the overlay, later runs toggle it.
      await api.scripting.executeScript({ target: { tabId: target.id }, files: ["content.js"] });
      return;
    } catch {
      // Restricted page (chrome://, about:, store, PDF viewer…) — fall through.
    }
  }
  await openFallback();
}

async function getFallbackWindowId(): Promise<number | undefined> {
  const stored = await api.storage.session.get(FALLBACK_WINDOW_KEY);
  return stored[FALLBACK_WINDOW_KEY] as number | undefined;
}

async function closeFallbackIfFocused(): Promise<boolean> {
  const id = await getFallbackWindowId();
  if (id === undefined) return false;
  try {
    const win = await api.windows.get(id);
    if (!win.focused) return false;
    await api.windows.remove(id);
    return true;
  } catch {
    await api.storage.session.remove(FALLBACK_WINDOW_KEY);
    return false;
  }
}

async function openFallback(): Promise<void> {
  const existing = await getFallbackWindowId();
  if (existing !== undefined) {
    try {
      await api.windows.update(existing, { focused: true });
      return;
    } catch {
      // Window is gone; create a new one.
    }
  }
  const win = await api.windows.create({
    url: api.runtime.getURL("ui.html"),
    type: "popup",
    width: 800,
    height: 560,
  });
  if (win?.id !== undefined) {
    await api.storage.session.set({ [FALLBACK_WINDOW_KEY]: win.id });
  }
}
