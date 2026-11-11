/**
 * Promise-based extension API for both browsers.
 * Firefox exposes `browser.*` (promises); Chrome MV3 `chrome.*` returns promises too.
 */
export const api: typeof chrome =
  (globalThis as { browser?: typeof chrome }).browser ?? globalThis.chrome;
