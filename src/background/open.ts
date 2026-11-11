import { api } from "../shared/api";
import type { OpenWhere } from "../shared/protocol";
import type { PageInfo } from "../shared/types";

export async function openUrl(
  url: string,
  where: OpenWhere,
  sender: chrome.runtime.MessageSender,
): Promise<void> {
  if (where === "newWindow") {
    await api.windows.create({ url });
    return;
  }

  const tab = await targetTab(sender);
  if (where === "current" && tab?.id !== undefined) {
    await api.tabs.update(tab.id, { url });
    return;
  }

  const props: chrome.tabs.CreateProperties = { url, active: where !== "background" };
  if (tab) {
    props.windowId = tab.windowId;
    props.index = tab.index + 1;
    if (tab.id !== undefined) props.openerTabId = tab.id;
  }
  await api.tabs.create(props);
}

/**
 * The tab the user is "on". For the overlay that is the tab it runs in; for
 * the fallback popup window it is the active tab of the last focused normal window.
 */
async function targetTab(sender: chrome.runtime.MessageSender): Promise<chrome.tabs.Tab | undefined> {
  const fromExtensionPage = sender.url?.startsWith(api.runtime.getURL("")) ?? false;
  if (sender.tab && !fromExtensionPage) return sender.tab;
  try {
    const win = await api.windows.getLastFocused({ populate: true, windowTypes: ["normal"] });
    return win.tabs?.find((t) => t.active);
  } catch {
    return undefined;
  }
}

/** URL and title of the page the user is on (for "add bookmark"), if readable. */
export async function currentPage(sender: chrome.runtime.MessageSender): Promise<PageInfo | null> {
  const tab = await targetTab(sender);
  if (!tab?.url) return null;
  return { url: tab.url, title: tab.title ?? tab.url };
}
