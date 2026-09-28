import { pollRateLimitRetryAfterMs } from "../commands/poll-quota.mts";
import type { RateLimitInfo } from "../github/client.mts";

/** One optional Actions-enrichment budget for the entire PR snapshot. */
export class TriageBudget {
  private exhausted = false;
  private secondaryError: unknown;
  private omissionReported = false;

  get canSchedule(): boolean {
    return !this.exhausted && this.secondaryError === undefined;
  }

  get primaryExhausted(): boolean {
    return this.exhausted;
  }

  observe(rateLimit?: RateLimitInfo): void {
    if (rateLimit?.remaining === 0) this.stopForPrimaryLimit();
  }

  observeError(error: unknown): void {
    const retry = pollRateLimitRetryAfterMs(error);
    if (retry?.kind === "secondary") {
      this.secondaryError ??= error;
    } else if (retry?.kind === "primary") {
      this.stopForPrimaryLimit();
    }
  }

  throwIfSecondary(): void {
    if (this.secondaryError !== undefined) throw this.secondaryError;
  }

  private stopForPrimaryLimit(): void {
    this.exhausted = true;
    if (this.omissionReported) return;
    this.omissionReported = true;
    process.stderr.write(
      "pr-shepherd: REST core quota is exhausted; optional Actions job and log enrichment is incomplete\n",
    );
  }
}
