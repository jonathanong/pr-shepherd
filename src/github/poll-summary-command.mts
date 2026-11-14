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
  refs?: string[],
): string {
  const args =
    selection.kind === "stack"
      ? [
          "stack",
          // Listed PRs name the caller's own layers; otherwise the stack number selects them all.
          ...(refs ??
            (selection.owned
              ? selection.owned.map((pr) => formatPrUrl(repo, pr))
              : [`${repo}#${selection.stackNumber}`])),
          opts.tick ? "--once" : "--until-terminal",
        ]
      : [
          ...(opts.tick ? ["iterate"] : []),
          ...selection.requested.map((pr) => formatPrUrl(repo, pr)),
          ...(opts.tick ? [] : ["--until-terminal"]),
        ];
  if (opts.stackMerge?.kind === "ready") args.push("--merge-ready");
  else if (opts.stackMerge?.kind === "through")
    args.push("--merge-through", formatPrUrl(repo, opts.stackMerge.pr));
  else if (opts.merge) args.push("--merge");
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

/**
 * The two commands that approve unlisted layers: the same request listing them as well, and the
 * same request naming the stack number, which owns every layer.
 */
export function stackApprovalCommands(
  repo: string,
  selection: PollSummarySelection,
  opts: PollSummaryCommandOptions,
  extra: number[],
): { listed: string; whole: string } {
  if (selection.kind !== "stack") return { listed: "", whole: "" };
  const listed = [...new Set([...(selection.owned ?? []), ...extra])].sort((a, b) => a - b);
  return {
    listed: aggregateRerunCommand(repo, { ...selection, owned: listed }, opts),
    whole: aggregateRerunCommand(repo, selection, opts, [`${repo}#${selection.stackNumber}`]),
  };
}

/**
 * The same stack command, merging whichever owned prefix is ready instead of the whole scope.
 * `scoped` replaces the listed refs, so a stack number or a listed PR above a `--merge-through`
 * target cannot widen ownership past what the original request approved.
 */
export function mergeReadyCommand(command: string, scoped?: string[]): string {
  const swapped = command.replace(/ --merge(?:-through \S+)?(?= |$)/, " --merge-ready");
  return scoped
    ? swapped.replace(/ stack (?:[^-\s]\S* )+(?=--)/, ` stack ${scoped.join(" ")} `)
    : swapped;
}
