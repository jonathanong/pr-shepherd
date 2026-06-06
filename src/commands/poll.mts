import { runIterate } from "./iterate/index.mts";
import type { IterateCommandOptions, IterateResult } from "../types.mts";

interface PollCommandOptions extends IterateCommandOptions {
  intervalSeconds: number;
  timeoutSeconds: number;
  quietStatus?: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    process.stderr.write(".");
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

const MAX_TIMER_MS = 2 ** 31 - 1;

export async function runPoll(opts: PollCommandOptions): Promise<IterateResult> {
  const { intervalSeconds, timeoutSeconds, ...iterateOpts } = opts;
  const intervalMs = Math.min(intervalSeconds * 1000, MAX_TIMER_MS);
  const timeoutMs = Math.min(timeoutSeconds * 1000, MAX_TIMER_MS);
  const start = Date.now();
  let tick = 0;
  let lastResult: IterateResult | undefined;
  const verbose = opts.verbose === true;
  const quietStatus = opts.quietStatus === true;
  let dotsPrinted = false;
  let lastWaitSignature: string | null = null;

  while (true) {
    tick += 1;
    lastResult = await runIterate(iterateOpts);
    if (lastResult.action !== "wait") break;

    const elapsedMs = Date.now() - start;
    const remainingMs = timeoutMs - elapsedMs;
    if (remainingMs <= 0) break;
    if (remainingMs < intervalMs) break;

    const nextSleepMs = intervalMs;
    if (quietStatus) {
      const signature = waitSignature(lastResult);
      if (signature !== lastWaitSignature) {
        writeQuietStatus(
          tick,
          Math.round(elapsedMs / 1000),
          Math.round(nextSleepMs / 1000),
          lastResult,
        );
      }
      lastWaitSignature = signature;
    } else {
      writeTickProgress(
        tick,
        Math.round(elapsedMs / 1000),
        Math.round(nextSleepMs / 1000),
        verbose,
      );
      if (!verbose) dotsPrinted = true;
    }
    await sleep(nextSleepMs);
  }

  if (dotsPrinted) process.stderr.write("\n");
  return lastResult!;
}
