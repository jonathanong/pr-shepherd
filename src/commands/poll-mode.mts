import type { PollMode } from "../config/load.mts";

/** The mode a command actually runs in. `auto` has been resolved away. */
export type ResolvedPollMode = "poll" | "event";

/** True when the process runs in a Claude Code cloud (remote) session. */
function isCloudSession(): boolean {
  return process.env["CLAUDE_CODE_REMOTE"] === "true";
}

/**
 * Resolve `--poll-mode` / the `pollMode` option / `poll.mode`. An explicit request wins over
 * config; `auto` becomes `event` only inside a cloud session. A missing value counts as `auto`.
 */
export function resolvePollMode(
  requested: PollMode | undefined,
  configured: PollMode | undefined,
): ResolvedPollMode {
  const mode = requested ?? configured ?? "auto";
  if (mode === "auto") return isCloudSession() ? "event" : "poll";
  return mode;
}
