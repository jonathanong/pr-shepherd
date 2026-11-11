import type { IterateCommandOptions } from "../types.mts";

export interface PollCommandOptions extends IterateCommandOptions {
  intervalSeconds: number;
  timeoutSeconds: number;
  /** Settle window after first TRIAGE before returning. Default 60. 0 disables. */
  debounceSeconds?: number;
  quietStatus?: boolean;
  untilTerminal?: boolean;
}
