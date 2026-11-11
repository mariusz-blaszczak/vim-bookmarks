import { parseKeys } from "./keys";

export interface Binding {
  keys: string;
  action: string;
}

export interface Match {
  action: string;
  /** Explicit count typed before the keys, or null if none. */
  count: number | null;
}

interface Compiled {
  tokens: string[];
  action: string;
}

const SEP = "\u0000";

/**
 * Resolves a stream of key tokens into actions: multi-key sequences ("gg"),
 * counts ("5j"), and a timeout for keys that are both a full mapping and a
 * prefix of a longer one.
 */
export class KeyEngine {
  private readonly bindings: Compiled[];
  private seq: string[] = [];
  private countStr = "";
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    bindings: readonly Binding[],
    private readonly onAction: (m: Match) => void,
    private readonly timeoutMs = 1000,
  ) {
    // Later bindings override earlier ones with the same keys.
    const byKeys = new Map<string, Compiled>();
    for (const b of bindings) {
      const tokens = parseKeys(b.keys);
      if (tokens.length > 0) byKeys.set(tokens.join(SEP), { tokens, action: b.action });
    }
    this.bindings = [...byKeys.values()].filter((b) => b.action !== "nop");
  }

  /** Typed-but-unresolved input, for a "showcmd" area. */
  get pending(): string {
    return this.countStr + this.seq.join("");
  }

  /** Returns true if the token was consumed. */
  feed(token: string): boolean {
    this.clearTimer();

    if (token === "<Esc>" && this.pending !== "") {
      this.reset();
      return true;
    }

    if (this.seq.length === 0 && /^[0-9]$/.test(token) && (token !== "0" || this.countStr !== "")) {
      this.countStr += token;
      return true;
    }

    const seq = [...this.seq, token];
    const exact = this.bindings.find((b) => sameTokens(b.tokens, seq));
    const isPrefix = this.bindings.some((b) => b.tokens.length > seq.length && startsWith(b.tokens, seq));

    if (exact && !isPrefix) {
      this.fire(exact.action);
      return true;
    }
    if (isPrefix) {
      this.seq = seq;
      if (exact) this.timer = setTimeout(() => this.fire(exact.action), this.timeoutMs);
      return true;
    }

    const hadPending = this.pending !== "";
    this.reset();
    return hadPending;
  }

  reset(): void {
    this.clearTimer();
    this.seq = [];
    this.countStr = "";
  }

  private fire(action: string): void {
    const count = this.countStr === "" ? null : Number.parseInt(this.countStr, 10);
    this.reset();
    this.onAction({ action, count });
  }

  private clearTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }
}

function sameTokens(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i]);
}

function startsWith(a: readonly string[], prefix: readonly string[]): boolean {
  return prefix.every((t, i) => t === a[i]);
}
