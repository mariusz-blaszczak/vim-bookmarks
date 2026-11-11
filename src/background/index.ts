import { api } from "../shared/api";

const FALLBACK_WINDOW_KEY = "fallbackWindowId";

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
