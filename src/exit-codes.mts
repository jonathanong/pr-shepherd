/**
 * Process exit codes for the pr-shepherd CLI.
 *
 * Three bands:
 *   0        done — shepherd finished and the PR is in a good terminal state
 *   10-19    shepherd RAN successfully; the code reports PR state
 *   64-78    shepherd FAILED (BSD `sysexits.h` codes)
 *
 * Caller rule: `$? >= 64` means shepherd itself failed. `0` or `10-19` means it
 * ran to completion and is reporting PR state. See docs/exit-codes.md.
 */

import type { CancelReason, IterateResult } from "./types.mts";

export const EXIT = Object.freeze({
  /** `cancel` + `merged` or `ready-delay-elapsed` — shepherd finished cleanly. */
  OK: 0,

  /** Nothing to do yet; CI still in progress. */
  WAIT: 10,
  /** Draft PR converted to ready for review. */
  MARK_READY: 11,
  /** Agent work required. */
  FIX_CODE: 12,
  /** Human attention required. */
  ESCALATE: 13,
  /** `cancel` + `closed` — PR closed without merging. */
  CLOSED: 14,
  /** Agent should run the emitted merge or queue command. */
  MERGE: 15,

  /** Bad/unknown flag, unknown subcommand, missing required arg, invalid duration. */
  USAGE: 64,
  /** Malformed caller data: bad `--require-sha`, `PRRC_*` IDs, bad repo string. */
  DATAERR: 65,
  /** Input file/stdin could not be read. */
  NOINPUT: 66,
  /** Precondition unmet: no open PR for branch, thread not eligible, unclassified 4xx. */
  UNAVAILABLE: 69,
  /** Unexpected/unclassified internal error — the fallback. */
  SOFTWARE: 70,
  /** Retryable GitHub failure: 429, 5xx, rate limit exhausted, `Retry-After` present. */
  TEMPFAIL: 75,
  /** GitHub 401/403 — missing token or insufficient PAT scopes. */
  NOPERM: 77,
  /** `.pr-shepherdrc.yml` validation failure. */
  CONFIG: 78,
} as const);

/** An error that carries its own exit code, so the top-level handler doesn't have to guess. */
export class ShepherdError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number, opts?: { cause?: unknown }) {
    super(message, opts);
    this.name = "ShepherdError";
    this.exitCode = exitCode;
  }
}

const CANCEL_REASON_EXIT_CODE: Record<CancelReason, number> = {
  merged: EXIT.OK,
  "ready-delay-elapsed": EXIT.OK,
  closed: EXIT.CLOSED,
};

export function iterateResultToExitCode(result: IterateResult): number {
  switch (result.action) {
    case "cancel":
      return CANCEL_REASON_EXIT_CODE[result.reason];
    case "wait":
      return EXIT.WAIT;
    case "mark_ready":
      return EXIT.MARK_READY;
    case "fix_code":
      return EXIT.FIX_CODE;
    case "escalate":
      return EXIT.ESCALATE;
    case "merge":
      return EXIT.MERGE;
  }
}

export function errorToExitCode(err: unknown): number {
  if (err instanceof ShepherdError) return err.exitCode;
  return EXIT.SOFTWARE;
}
