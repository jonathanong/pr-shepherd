import { loadConfig } from "../config/load.mts";
import { formatPrUrl } from "../pr-reference.mts";
import { buildPrShepherdCommand } from "../cli/runner.mts";
import type { PollSummaryCommandOptions, PollSummaryItem } from "../types.mts";
export function pollCommandFields(
  repo: string,
  pr: number,
  isDraft: boolean,
  opts: PollSummaryCommandOptions,
): Pick<PollSummaryItem, "pollCommand" | "pollProbe"> {
  const autoMarkReadyDisabled =
    opts.noAutoMarkReady || loadConfig().actions.autoMarkReady === false;
  const boundedDraft = isDraft && autoMarkReadyDisabled;
  const args = boundedDraft
    ? [formatPrUrl(repo, pr), "--timeout", "1s", "--debounce", "0s", "--no-auto-mark-ready"]
    : [formatPrUrl(repo, pr), "--until-terminal"];
  if (opts.merge && opts.stackPrNumber === undefined) args.push("--merge");
  if (opts.readyDelaySeconds !== undefined)
    args.push("--ready-delay", `${opts.readyDelaySeconds}s`);
  if (opts.stallTimeoutSeconds !== undefined)
    args.push("--stall-timeout", `${opts.stallTimeoutSeconds}s`);
  if (opts.noAutoMarkReady && !boundedDraft) args.push("--no-auto-mark-ready");
  const pollCommand = buildPrShepherdCommand(args).text;
  return boundedDraft ? { pollCommand, pollProbe: true } : { pollCommand };
}
