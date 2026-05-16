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
  if (process.stderr.isTTY || verbose) {
    process.stderr.write(
      `[poll tick ${tick} / +${elapsedSeconds}s] WAIT — sleeping ${sleepSeconds}s\n`,
    );
  }
}

export async function runPoll(opts: PollCommandOptions): Promise<IterateResult> {
  const { intervalSeconds, timeoutSeconds, ...iterateOpts } = opts;
  const intervalMs = intervalSeconds * 1000;
  const timeoutMs = timeoutSeconds * 1000;
  const start = Date.now();
  let tick = 0;
  let lastResult: IterateResult | undefined;
  const verbose = opts.verbose === true;

  while (true) {
    tick += 1;
    lastResult = await runIterate(iterateOpts);
    if (lastResult.action !== "wait") return lastResult;

    const elapsedMs = Date.now() - start;
    const remainingMs = timeoutMs - elapsedMs;
    if (remainingMs <= 0) return lastResult;

    const nextSleepMs = Math.min(intervalMs, remainingMs);
    writeTickProgress(tick, Math.round(elapsedMs / 1000), Math.round(nextSleepMs / 1000), verbose);
    await sleep(nextSleepMs);
  }
}
