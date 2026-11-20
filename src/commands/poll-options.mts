import type { IterateCommandOptions } from "../types.mts";

export interface PollCommandOptions extends IterateCommandOptions {
  intervalSeconds: number;
  timeoutSeconds: number;
  /** Settle window after first TRIAGE before returning. Default 60. 0 disables. */
  debounceSeconds?: number;
  quietStatus?: boolean;
  untilTerminal?: boolean;
  /** Runs before every tick; the per-PR watcher lock uses it to stop a watcher that lost its lock. */
  beforeTick?: () => void;
}

export type Announce = (sleepMs: number, viaEvents: boolean) => void;
