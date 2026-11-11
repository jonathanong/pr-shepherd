import type { IterateResult } from "../types.mts";
import type { RateLimitProbePull, RateLimitPullTarget } from "./poll-rate-limit-cancel.mts";
import type { createUntilTerminalRateLimitRetry } from "./poll-rate-limit-wait.mts";

export interface TickRunnerInput {
  /** One iterate read; `fingerprintCache` allows reuse of a previous WAIT-shaped report. */
  run: (fingerprintCache: boolean) => Promise<IterateResult>;
  retry: ReturnType<typeof createUntilTerminalRateLimitRetry>;
  untilTerminal: boolean;
  intervalMs: number;
  tickLabel: string;
  startedAt: number;
  /** Read lazily: the last result can change between a tick and its retry. */
  targets: () => RateLimitPullTarget[];
  onAllTerminal: (pulls: RateLimitProbePull[]) => IterateResult | undefined;
}

/** One poll tick that waits out GitHub rate limits instead of failing. */
export function createTickRunner(input: TickRunnerInput) {
  return async (fingerprintCache: boolean): Promise<IterateResult> => {
    while (true) {
      try {
        const result = await input.run(fingerprintCache);
        input.retry.reset();
        return result;
      } catch (err) {
        const early = await input.retry.wait(err, {
          untilTerminal: input.untilTerminal,
          intervalMs: input.intervalMs,
          tickLabel: input.tickLabel,
          startedAt: input.startedAt,
          targets: input.targets(),
          onAllTerminal: input.onAllTerminal,
        });
        if (early) return early;
      }
    }
  };
}
