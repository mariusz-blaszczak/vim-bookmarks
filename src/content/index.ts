import { mountApp, type App } from "../ui/app";
import css from "../ui/style.css";

/**
 * Injected on demand via scripting.executeScript. Re-injection into the same
 * page reuses the controller stored on window, so each injection toggles.
 */

interface Overlay {
  toggle(): void;
}

const KEY = "__vimBookmarksOverlay";
const scope = window as unknown as Record<typeof KEY, Overlay | undefined>;

(scope[KEY] ??= createOverlay()).toggle();

function createOverlay(): Overlay {
  let host: HTMLElement | null = null;
  let app: App | null = null;
  let previousFocus: Element | null = null;

  // Capture phase on window: we see keys before the page's own handlers.
  const onKeyDown = (e: KeyboardEvent): void => {
    if (!app) return;
    e.stopImmediatePropagation();
    if (app.handleKey(e)) e.preventDefault();
  };
  const swallow = (e: KeyboardEvent): void => e.stopImmediatePropagation();

  function open(): void {
    previousFocus = document.activeElement;

    host = document.createElement("vim-bookmarks");
    host.style.cssText = "all: initial; position: fixed; inset: 0; z-index: 2147483647;";
    const shadow = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = css;
    const root = document.createElement("div");
    shadow.append(style, root);
    document.documentElement.append(host);

    app = mountApp(root, { onClose: close, standalone: false });
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", swallow, true);
    window.addEventListener("keypress", swallow, true);
    app.focus();
  }

  function close(): void {
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", swallow, true);
    window.removeEventListener("keypress", swallow, true);
    app?.destroy();
    host?.remove();
    app = null;
    host = null;
    if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }

  return {
    toggle: () => (host ? close() : open()),
  };
}
