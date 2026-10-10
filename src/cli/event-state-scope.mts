import { loadConfig, type PollMode } from "../config/load.mts";
import { EXIT } from "../exit-codes.mts";
import { resolvePollMode } from "../commands/poll-mode.mts";
import { runWithDurableState } from "../state/durable-state.mts";
import { getFlag } from "./args.mts";
import { isDefaultPollInvocation } from "./default-poll.mts";

/** Subcommands that honor `--poll-mode`; the default poll invocation honors it too. */
const POLL_MODE_SUBCOMMANDS = new Set(["iterate", "poll"]);
const REQUESTABLE: readonly PollMode[] = ["auto", "poll", "event"];

function requestedPollMode(value: string | null): PollMode | undefined {
  return REQUESTABLE.find((mode) => mode === value);
}

/**
 * Run a dispatched command, entering the durable state scope first when it resolves to event
 * mode. Entering before log setup keeps the per-worktree log a peer of the seen markers and
 * stall state an event session writes. Invalid flags or config fall through unscoped so the
 * command handler reports them.
 */
export function runInEventStateScope<T>(args: string[], work: () => Promise<T>): Promise<T> {
  const subcommand = args[0];
  const honorsPollMode =
    isDefaultPollInvocation(subcommand) || POLL_MODE_SUBCOMMANDS.has(subcommand ?? "");
  return honorsPollMode ? runInPollModeScope(args, work) : work();
}

/**
 * Report an invalid `--poll-mode` value as a usage error. Commands that only use the flag to
 * pick a state scope (`log-file`, `clean`) call this before `runInPollModeScope`, because no
 * later handler would reject a typo there. Returns true after printing the error.
 */
export function rejectInvalidPollModeFlag(args: string[], command: string): boolean {
  if (!args.some((arg) => arg === "--poll-mode" || arg.startsWith("--poll-mode="))) return false;
  const value = getFlag(args, "--poll-mode");
  if (requestedPollMode(value)) return false;
  process.stderr.write(
    `pr-shepherd: ${command}: --poll-mode must be one of ${REQUESTABLE.join(", ")}, got ${JSON.stringify(value ?? "")}\n`,
  );
  process.exitCode = EXIT.USAGE;
  return true;
}

/**
 * Run `work` in the durable state scope when `--poll-mode` in `args`, or else `poll.mode`,
 * resolves to event mode. `log-file` and `clean` use this to reach the state an event tick
 * writes.
 */
export function runInPollModeScope<T>(args: string[], work: () => Promise<T>): Promise<T> {
  return resolvesToEvent(args) ? runWithDurableState(work) : work();
}

function resolvesToEvent(args: string[]): boolean {
  const flag = getFlag(args, "--poll-mode");
  const requested = requestedPollMode(flag);
  // An explicit poll or event request wins without reading config, so a malformed config
  // cannot drop an explicit `--poll-mode event` out of the durable scope.
  if (requested === "event" || requested === "poll") return requested === "event";
  try {
    return resolvePollMode(requested, loadConfig().poll.mode) === "event";
  } catch {
    return false;
  }
}
