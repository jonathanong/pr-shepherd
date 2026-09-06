import type { IterateResult } from "../types.mts";

function writeTickProgress(
  tick: number,
  elapsedSeconds: number,
  sleepSeconds: number,
  verbose: boolean,
): void {
  if (verbose) {
    process.stderr.write(
      `[poll tick ${tick} / +${elapsedSeconds}s] WAIT — sleeping ${sleepSeconds}s\n`,
    );
  } else {
    process.stderr.write(
      `[poll tick ${tick} / +${elapsedSeconds}s] WAIT — still running; next tick in ${sleepSeconds}s\n`,
    );
  }
}

function waitSignature(result: IterateResult): string {
  const activity = result.activity ?? {
    commitCount: 0,
    reviewRoundCount: 0,
    latestCommitCommittedAtUnix: null,
    reviewItemsSinceLatestCommit: [],
  };
  return JSON.stringify({
    status: result.status,
    mergeStateStatus: result.mergeStateStatus,
    reviewDecision: result.reviewDecision,
    state: result.state,
    active: (result.inProgressChecks ?? []).map((c) => [c.name, c.status, c.runId]),
    commitCount: activity.commitCount,
    latestCommitCommittedAtUnix: activity.latestCommitCommittedAtUnix,
    reviewRoundCount: activity.reviewRoundCount,
    reviewItemsSinceLatestCommit: activity.reviewItemsSinceLatestCommit.length,
  });
}

function writeQuietStatus(
  tick: number,
  elapsedSeconds: number,
  sleepSeconds: number,
  result: IterateResult,
): void {
  const activeChecks = result.inProgressChecks ?? [];
  const activeCheckText = activeChecks.map((c) => `${c.name} (${c.status})`).join(", ");
  const active = activeChecks.length > 0 ? ` · active: ${activeCheckText}` : "";
  const commitCount = result.activity?.commitCount ?? 0;
  const reviewItems = result.activity?.reviewItemsSinceLatestCommit.length ?? 0;
  const reviewRounds = result.activity?.reviewRoundCount ?? 0;
  const commitSeg = commitCount > 0 ? ` · ${commitCount} commits` : "";
  const reviewRoundSeg = reviewRounds > 0 ? ` · ${reviewRounds} review rounds` : "";
  const reviewSeg = reviewItems > 0 ? ` · ${reviewItems} review items since latest commit` : "";
  process.stderr.write(
    `[poll tick ${tick} / +${elapsedSeconds}s] WAIT ${result.status}/${result.mergeStateStatus}/${result.reviewDecision ?? "NO_REVIEW_DECISION"}${active}${commitSeg}${reviewRoundSeg}${reviewSeg} — sleeping ${sleepSeconds}s\n`,
  );
}

export function writeWaitProgress(opts: {
  tick: number;
  elapsedMs: number;
  sleepMs: number;
  result: IterateResult;
  quietStatus: boolean;
  verbose: boolean;
  lastWaitSignature: string | null;
}): string | null {
  const elapsedSeconds = Math.round(opts.elapsedMs / 1000);
  const sleepSeconds = Math.round(opts.sleepMs / 1000);
  if (!opts.quietStatus) {
    writeTickProgress(opts.tick, elapsedSeconds, sleepSeconds, opts.verbose);
    return opts.lastWaitSignature;
  }
  const signature = waitSignature(opts.result);
  if (signature !== opts.lastWaitSignature) {
    writeQuietStatus(opts.tick, elapsedSeconds, sleepSeconds, opts.result);
  }
  return signature;
}

export function writeDebounceProgress(tick: number, elapsedMs: number, remainingMs: number): void {
  const elapsedSeconds = Math.round(elapsedMs / 1000);
  const remainingSeconds = Math.round(remainingMs / 1000);
  process.stderr.write(
    `[poll tick ${tick} / +${elapsedSeconds}s] FIX_CODE — debounce ${remainingSeconds}s remaining\n`,
  );
}
