import { runIterate } from "./iterate/index.mts";
import type { IterateCommandOptions, IterateResult } from "../types.mts";

export interface PollCommandOptions extends IterateCommandOptions {
  intervalSeconds: number;
  timeoutSeconds: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeTickProgress(tick: number, elapsedSeconds: number, intervalSeconds: number): void {
  if (process.stderr.isTTY || process.env["SHEPHERD_POLL_VERBOSE"] === "1") {
    process.stderr.write(
      `[poll tick ${tick} / +${elapsedSeconds}s] WAIT — sleeping ${intervalSeconds}s\n`,
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

  while (true) {
    tick += 1;
    lastResult = await runIterate(iterateOpts);
    if (lastResult.action !== "wait") return lastResult;

    const elapsedMs = Date.now() - start;
    if (elapsedMs + intervalMs >= timeoutMs) return lastResult;

    writeTickProgress(tick, Math.round(elapsedMs / 1000), intervalSeconds);
    await sleep(intervalMs);
  }
}
