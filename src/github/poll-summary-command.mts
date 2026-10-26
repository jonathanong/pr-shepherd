import { loadConfig } from "../config/load.mts";
import { formatPrUrl } from "../pr-reference.mts";
import { buildPrShepherdCommand } from "../cli/runner.mts";
import type {
  PollSummaryCommandOptions,
  PollSummaryItem,
  PollSummarySelection,
} from "../types.mts";
export function pollCommandFields(
  repo: string,
  pr: number,
  isDraft: boolean,
  opts: PollSummaryCommandOptions,
): Pick<PollSummaryItem, "pollCommand" | "pollProbe"> {
  const autoMarkReadyDisabled = opts.noAutoMarkReady || loadConfig()["mark-ready"].auto === false;
  const boundedDraft = isDraft && autoMarkReadyDisabled;
  const url = formatPrUrl(repo, pr);
  // A single tick routes each PR to one `iterate` tick rather than a sleeping poll.
  const args = opts.tick
    ? ["iterate", url, ...(boundedDraft ? ["--no-auto-mark-ready"] : [])]
    : boundedDraft
      ? [url, "--timeout", "1s", "--debounce", "0s", "--no-auto-mark-ready"]
      : [url, "--until-terminal"];
  if (opts.merge && opts.stackPrNumber === undefined) args.push("--merge");
  if (opts.readyDelaySeconds !== undefined)
    args.push("--ready-delay", `${opts.readyDelaySeconds}s`);
  if (opts.stallTimeoutSeconds !== undefined)
    args.push("--stall-timeout", `${opts.stallTimeoutSeconds}s`);
  if (opts.instructions) args.push("--instructions", opts.instructions);
  if (opts.noAutoMarkReady && !boundedDraft) args.push("--no-auto-mark-ready");
  const pollCommand = buildPrShepherdCommand(args).text;
  return boundedDraft ? { pollCommand, pollProbe: true } : { pollCommand };
}

/**
 * The literal command that re-runs this aggregate selection with the options the caller used.
 * Intervals and timeouts are omitted: they are loop cadence, not selection. Options equal to the
 * configured defaults are omitted too, since the parser fills them from config.
 */
export function aggregateRerunCommand(
  repo: string,
  selection: PollSummarySelection,
  opts: PollSummaryCommandOptions,
): string {
  const args =
    selection.kind === "stack"
      ? ["stack", formatPrUrl(repo, selection.anchor), opts.tick ? "--once" : "--until-terminal"]
      : [...selection.requested.map((pr) => formatPrUrl(repo, pr)), "--until-terminal"];
  if (opts.merge) args.push("--merge");
  // The parser always fills these from config, so a default value adds nothing to the command.
  const iterate = loadConfig().iterate;
  if (
    opts.readyDelaySeconds !== undefined &&
    opts.readyDelaySeconds !== iterate["ready-delay-minutes"] * 60
  )
    args.push("--ready-delay", `${opts.readyDelaySeconds}s`);
  if (
    opts.stallTimeoutSeconds !== undefined &&
    opts.stallTimeoutSeconds !== iterate["stall-timeout-minutes"] * 60
  )
    args.push("--stall-timeout", `${opts.stallTimeoutSeconds}s`);
  if (opts.instructions) args.push("--instructions", opts.instructions);
  if (opts.noAutoMarkReady) args.push("--no-auto-mark-ready");
  return buildPrShepherdCommand(args).text;
}
