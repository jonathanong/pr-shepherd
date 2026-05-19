import { runIterate } from "./iterate/index.mts";
import type { IterateCommandOptions, IterateResult } from "../types.mts";

export interface PollCommandOptions extends IterateCommandOptions {
  intervalSeconds: number;
  timeoutSeconds: number;
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

const MAX_TIMER_MS = 2 ** 31 - 1;

export async function runPoll(opts: PollCommandOptions): Promise<IterateResult> {
  const { intervalSeconds, timeoutSeconds, ...iterateOpts } = opts;
  const intervalMs = Math.min(intervalSeconds * 1000, MAX_TIMER_MS);
  const timeoutMs = Math.min(timeoutSeconds * 1000, MAX_TIMER_MS);
  const start = Date.now();
  let tick = 0;
  let lastResult: IterateResult | undefined;
  const verbose = opts.verbose === true;
  let dotsPrinted = false;

  while (true) {
    tick += 1;
    lastResult = await runIterate(iterateOpts);
    if (lastResult.action !== "wait") break;

    const elapsedMs = Date.now() - start;
    const remainingMs = timeoutMs - elapsedMs;
    if (remainingMs <= 0) break;

    const nextSleepMs = Math.min(intervalMs, remainingMs);
    writeTickProgress(tick, Math.round(elapsedMs / 1000), Math.round(nextSleepMs / 1000), verbose);
    if (!verbose) dotsPrinted = true;
    await sleep(nextSleepMs);
  }

  if (dotsPrinted) process.stderr.write("\n");
  return lastResult!;
}
