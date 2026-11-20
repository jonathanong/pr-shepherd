import { runAggregatePollCommand, runPollCommand, runPollSummaryTick } from "../commands/tick.mts";
import { parseCommonArgs, hasFlag } from "./args.mts";
import { emitIterateResult } from "./iterate-emitter.mts";
import { EXIT } from "../exit-codes.mts";
import { emitPollSummaryResult } from "./poll-summary-emitter.mts";
import { parsePollTargets, resolvePollTargets } from "./poll-targets.mts";
import { parseStackMerge } from "./stack-merge-args.mts";
import { resolveStackTarget, stackMergeScope } from "../commands/stack-targets.mts";
import { DEFAULT_POLL_BOOLEAN_FLAGS, DEFAULT_POLL_FLAGS_WITH_VALUES } from "./default-poll.mts";
import { validateDefaultArgs } from "./validate-default-args.mts";
import { rejectRemovedFlags } from "./removed-flags.mts";
import { rejectUnknownFlags } from "./unknown-flags.mts";
import { maybePrintHelp, USAGE } from "./help.mts";
import { parseLoopOptions } from "./poll-loop-options.mts";
import { watchFlagsOf, withWatchLock } from "./poll-watch.mts";
import { runsSingleTick } from "../commands/single-tick.mts";
import { getCurrentPrNumber } from "../github/client.mts";

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
    await withWatchLock(
      {
        repo: resolvedTargets.targetRepository,
        prs: resolvedTargets.prNumbers,
        flags: watchFlagsOf(shared.options),
        format: parsedTargets.global.format,
      },
      async (watch, prNumbers) => {
        const result = await runAggregatePollCommand({
          ...shared.options,
          ...resolvedTargets,
          prNumbers,
          ...(watch && { watch }),
        });
        emitPollSummaryResult(result, { format: parsedTargets.global.format });
      },
    );
    return;
  }
  const { prNumber, global: globalOpts, extra } = parseCommonArgs(args);
  const shared = parseLoopOptions(extra, globalOpts, false);
  if (!shared) return;
  const pr =
    prNumber ?? (runsSingleTick() ? undefined : ((await getCurrentPrNumber()) ?? undefined));
  await withWatchLock(
    {
      repo: globalOpts.targetRepository,
      prs: pr === undefined ? [] : [pr],
      flags: watchFlagsOf(shared.options),
      format: globalOpts.format,
    },
    async () => {
      const result = await runPollCommand({ ...shared.options, prNumber: pr });
      emitIterateResult(result, {
        format: globalOpts.format,
        verbose: globalOpts.verbose ?? false,
        readyDelaySuffix: shared.readyDelaySuffix,
      });
    },
  );
}

/** `pr-shepherd stack <ref> [<ref> ...]`: the native stack that a stack number or PRs select. */
export async function handleStack(args: string[]): Promise<void> {
  if (maybePrintHelp(args, "stack")) return;
  if (rejectRemovedFlags(args) || rejectUnknownFlags(args, "stack", STACK_FLAGS)) return;
  if (!validateDefaultArgs(args, STACK_FLAGS_WITH_VALUES, STACK_BOOLEAN_FLAGS, usageArg)) return;
  const parsedTargets = parsePollTargets(args);
  if (!parsedTargets) return;
  if (parsedTargets.refs.length === 0) {
    usage("stack requires a PR or stack reference.");
    return;
  }
  const merge = parseStackMerge(parsedTargets.extra);
  if (!merge) return;
  const shared = parseLoopOptions(parsedTargets.extra, parsedTargets.global, true);
  if (!shared) return;
  const target = await resolveStackTarget({
    refs: parsedTargets.refs,
    ...(merge.through && { through: merge.through }),
    ...(merge.flag && { merge: merge.flag }),
  });
  const scope = stackMergeScope(merge.flag, target.through);
  const options = {
    ...shared.options,
    merge: scope !== undefined,
    ...(scope && { stackMerge: scope }),
    stackPrNumber: target.anchor,
    ...(target.owned && { stackOwned: target.owned }),
    targetRepository: target.targetRepository,
  };
  const once = hasFlag(parsedTargets.extra, "--once");
  await withWatchLock(
    {
      repo: target.targetRepository,
      prs: [],
      growing: !once,
      flags: watchFlagsOf(options),
      format: parsedTargets.global.format,
    },
    async (watch) => {
      const result = once
        ? await runPollSummaryTick(options)
        : await runAggregatePollCommand({ ...options, ...(watch && { watch }) });
      emitPollSummaryResult(result, { format: parsedTargets.global.format });
    },
  );
}

// `--layers` is for the one-PR commands a stack prints; `stack` itself has no use for it.
const STACK_FLAGS_WITH_VALUES = new Set([
  ...[...DEFAULT_POLL_FLAGS_WITH_VALUES].filter((flag) => flag !== "--layers"),
  "--merge-through",
]);
const STACK_BOOLEAN_FLAGS = new Set([...DEFAULT_POLL_BOOLEAN_FLAGS, "--once", "--merge-ready"]);
const STACK_FLAGS = [...STACK_FLAGS_WITH_VALUES, ...STACK_BOOLEAN_FLAGS];

function usageArg(arg: string): void {
  usage(`unexpected argument: "${arg}"`);
}

function usage(message: string): void {
  process.stderr.write(`pr-shepherd: stack: ${message}\n${USAGE.stack}\n`);
  process.exitCode = EXIT.USAGE;
}
