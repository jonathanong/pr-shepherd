import { runAggregatePollCommand, runPollCommand, runPollSummaryTick } from "../commands/tick.mts";
import { loadConfig } from "../config/load.mts";
import { parseCommonArgs, getFlag, hasFlag } from "./args.mts";
import { parseDurationToSeconds } from "./duration.mts";
import { validateSecondsDurationFlag } from "./duration-flag.mts";
import { hasInvalidIterateFlags, parseIterateFlags } from "./iterate-flags.mts";
import { emitIterateResult } from "./iterate-emitter.mts";
import { EXIT } from "../exit-codes.mts";
import { emitPollSummaryResult } from "./poll-summary-emitter.mts";
import { parsePollTargets, resolvePollTargets } from "./poll-targets.mts";
import { DEFAULT_POLL_BOOLEAN_FLAGS, DEFAULT_POLL_FLAGS_WITH_VALUES } from "./default-poll.mts";
import { validateDefaultArgs } from "./validate-default-args.mts";
import { rejectRemovedFlags } from "./removed-flags.mts";
import { rejectUnknownFlags } from "./unknown-flags.mts";
import { maybePrintHelp, USAGE } from "./help.mts";

/** The default command: one PR, or several PRs from one repository. */
export async function handlePoll(args: string[]): Promise<void> {
  const parsedTargets = parsePollTargets(args);
  if (!parsedTargets) return;
  const resolvedTargets =
    parsedTargets.refs.length > 1 ? await resolvePollTargets(parsedTargets) : { prNumbers: [] };
  // Duplicate references collapse to one PR, which takes the single-PR iterator.
  if (resolvedTargets.prNumbers.length > 1) {
    const shared = parseLoopOptions(parsedTargets.extra, parsedTargets.global, true);
    if (!shared) return;
    const result = await runAggregatePollCommand({ ...shared.options, ...resolvedTargets });
    emitPollSummaryResult(result, { format: parsedTargets.global.format });
    return;
  }
  const { prNumber, global: globalOpts, extra } = parseCommonArgs(args);
  const shared = parseLoopOptions(extra, globalOpts, false);
  if (!shared) return;
  const result = await runPollCommand({ ...shared.options, prNumber });
  emitIterateResult(result, {
    format: globalOpts.format,
    verbose: globalOpts.verbose ?? false,
    readyDelaySuffix: shared.readyDelaySuffix,
  });
}

/** `pr-shepherd stack <PR>`: the native stack containing one PR. */
export async function handleStack(args: string[]): Promise<void> {
  if (maybePrintHelp(args, "stack")) return;
  if (rejectRemovedFlags(args) || rejectUnknownFlags(args, "stack", STACK_FLAGS)) return;
  if (!validateDefaultArgs(args, DEFAULT_POLL_FLAGS_WITH_VALUES, STACK_BOOLEAN_FLAGS, usageArg))
    return;
  const parsedTargets = parsePollTargets(args);
  if (!parsedTargets) return;
  if (parsedTargets.refs.length !== 1) {
    usage("stack requires exactly one PR reference.");
    return;
  }
  const { prNumbers, targetRepository } = await resolvePollTargets(parsedTargets);
  const shared = parseLoopOptions(parsedTargets.extra, parsedTargets.global, true);
  if (!shared) return;
  const target = { stackPrNumber: prNumbers[0], targetRepository };
  const result = hasFlag(parsedTargets.extra, "--once")
    ? await runPollSummaryTick({ ...shared.options, ...target })
    : await runAggregatePollCommand({ ...shared.options, ...target });
  emitPollSummaryResult(result, { format: parsedTargets.global.format });
}

const STACK_BOOLEAN_FLAGS = new Set([...DEFAULT_POLL_BOOLEAN_FLAGS, "--once"]);
const STACK_FLAGS = [...DEFAULT_POLL_FLAGS_WITH_VALUES, ...STACK_BOOLEAN_FLAGS];

function parseLoopOptions(
  extra: string[],
  globalOpts: ReturnType<typeof parseCommonArgs>["global"],
  isAggregate: boolean,
) {
  const cfg = loadConfig();

  const flags = parseIterateFlags(extra, cfg);
  if (hasInvalidIterateFlags(flags)) return null;

  const intervalStr = getFlag(extra, "--interval");
  const intervalSuffix = validateSecondsDurationFlag(
    "pr-shepherd",
    "--interval",
    intervalStr,
    hasFlag(extra, "--interval"),
  );
  if (intervalSuffix === null) return null;
  let intervalSeconds = parseDurationToSeconds(intervalSuffix ?? "", cfg.poll.intervalSeconds);
  // `--interval` is the invocation interval. Only an omitted flag is scaled, and only for aggregates.
  if (isAggregate && intervalSuffix === undefined) {
    intervalSeconds *= cfg.poll.stackIntervalFactor;
  }

  const timeoutStr = getFlag(extra, "--timeout");
  const timeoutSuffix = validateSecondsDurationFlag(
    "pr-shepherd",
    "--timeout",
    timeoutStr,
    hasFlag(extra, "--timeout"),
  );
  if (timeoutSuffix === null) return null;
  const timeoutSeconds = parseDurationToSeconds(timeoutSuffix ?? "", cfg.poll.timeoutSeconds);

  const debounceStr = getFlag(extra, "--debounce");
  const debounceSuffix = validateSecondsDurationFlag(
    "pr-shepherd",
    "--debounce",
    debounceStr,
    hasFlag(extra, "--debounce"),
    { allowZero: true },
  );
  if (debounceSuffix === null) return null;
  const debounceSeconds = parseDurationToSeconds(debounceSuffix ?? "", cfg.poll.debounceSeconds, {
    allowZero: true,
  });

  const quietStatusFlag = hasFlag(extra, "--quiet-status");
  const noQuietStatusFlag = hasFlag(extra, "--no-quiet-status");
  if (quietStatusFlag && noQuietStatusFlag) {
    process.stderr.write(
      "pr-shepherd: --quiet-status and --no-quiet-status cannot be used together\n",
    );
    process.exitCode = EXIT.USAGE;
    return null;
  }
  const quietStatus = quietStatusFlag || (!noQuietStatusFlag && cfg.poll.quietStatus);

  return {
    readyDelaySuffix: flags.readyDelaySuffix ?? undefined,
    options: {
      ...globalOpts,
      readyDelaySeconds: flags.readyDelaySeconds,
      stallTimeoutSeconds: flags.stallTimeoutSeconds,
      noAutoMarkReady: flags.noAutoMarkReady,
      merge: flags.merge,
      instructions: flags.instructions ?? undefined,
      intervalSeconds,
      timeoutSeconds,
      debounceSeconds,
      quietStatus,
      untilTerminal: hasFlag(extra, "--until-terminal"),
    },
  };
}

function usageArg(arg: string): void {
  usage(`unexpected argument: "${arg}"`);
}

function usage(message: string): void {
  process.stderr.write(`pr-shepherd: stack: ${message}\n${USAGE.stack}\n`);
  process.exitCode = EXIT.USAGE;
}
