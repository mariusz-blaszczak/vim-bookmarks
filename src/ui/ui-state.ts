import { api } from "../shared/api";

/** Per-browser view state that survives closing the overlay. */
export interface UiState {
  expanded: string[];
  cursorId?: string;
}

const KEY = "uiState";

export async function loadUiState(): Promise<UiState | undefined> {
  try {
    const stored = await api.storage.local.get(KEY);
    return stored[KEY] as UiState | undefined;
  } catch {
    return undefined;
  }
}

export function saveUiState(state: UiState): void {
  api.storage.local.set({ [KEY]: state }).catch(() => {
    // Storage can be unavailable (e.g. extension reloaded under the page); not fatal.
  });
}
