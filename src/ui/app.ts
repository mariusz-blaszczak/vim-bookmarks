export interface AppOptions {
  onClose(): void;
  /** true when rendered as the fallback extension page instead of an overlay */
  standalone: boolean;
}

export interface App {
  /** Returns true when the key was consumed (caller should preventDefault). */
  handleKey(e: KeyboardEvent): boolean;
  focus(): void;
  destroy(): void;
}

type Mode = "NORMAL";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function mountApp(root: HTMLElement, opts: AppOptions): App {
  const mode: Mode = "NORMAL";

  root.className = opts.standalone ? "vb-backdrop vb-standalone" : "vb-backdrop";

  const win = el("div", "vb-window");
  win.tabIndex = -1;
  win.setAttribute("role", "dialog");
  win.setAttribute("aria-label", "Bookmarks");

  const title = el("div", "vb-title", "Bookmarks");
  const body = el("div", "vb-body");
  body.append(
    el("div", "vb-line vb-dim", "~"),
    el("div", "vb-line vb-dim", "~  bookmark tree goes here (M1)"),
    el("div", "vb-line vb-dim", "~"),
  );

  const status = el("div", "vb-status");
  status.append(
    el("span", "vb-mode", mode),
    el("span", "vb-status-path", ""),
    el("span", "vb-status-hint", "q / Esc to close"),
  );

  win.append(title, body, status);
  root.append(win);

  // Click on the dimmed backdrop (outside the window) closes the overlay.
  const onBackdropClick = (e: MouseEvent): void => {
    if (e.target === root) opts.onClose();
  };
  root.addEventListener("mousedown", onBackdropClick);

  return {
    handleKey(e) {
      const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
      if (e.key === "Escape" || (plain && e.key === "q")) {
        opts.onClose();
        return true;
      }
      return false;
    },
    focus() {
      win.focus({ preventScroll: true });
    },
    destroy() {
      root.removeEventListener("mousedown", onBackdropClick);
      root.replaceChildren();
    },
  };
}
