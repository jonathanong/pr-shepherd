import { loadConfig, type PollMode } from "../config/load.mts";
import { resolvePollMode } from "../commands/poll-mode.mts";
import { runWithDurableState } from "../state/durable-state.mts";
import { getFlag } from "./args.mts";
import { isDefaultPollInvocation } from "./default-poll.mts";

/** Subcommands that honor `--poll-mode`; the default poll invocation honors it too. */
const POLL_MODE_SUBCOMMANDS = new Set(["iterate", "poll"]);
const REQUESTABLE: readonly PollMode[] = ["auto", "poll", "event"];

/**
 * Run a dispatched command, entering the durable state scope first when it resolves to event
 * mode. Entering before log setup keeps the per-worktree log a peer of the seen markers and
 * stall state an event session writes. Invalid flags or config fall through unscoped so the
 * command handler reports them.
 */
export function runInEventStateScope<T>(args: string[], work: () => Promise<T>): Promise<T> {
  return isEventInvocation(args) ? runWithDurableState(work) : work();
}

function isEventInvocation(args: string[]): boolean {
  const subcommand = args[0];
  if (!isDefaultPollInvocation(subcommand) && !POLL_MODE_SUBCOMMANDS.has(subcommand ?? "")) {
    return false;
  }
  const flag = getFlag(args, "--poll-mode");
  const requested = REQUESTABLE.find((mode) => mode === flag);
  try {
    return resolvePollMode(requested, loadConfig().poll.mode) === "event";
  } catch {
    return false;
  }
}
