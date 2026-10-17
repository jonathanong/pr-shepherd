import { runSuggestionPatches } from "../commands/suggestion-patches.mts";
import { runMarkFilesAsViewed } from "../commands/mark-files-as-viewed.mts";
import { runIterateTick, runPollSummaryTick } from "../commands/tick.mts";
import { loadConfig } from "../config/load.mts";
import { EXIT } from "../exit-codes.mts";
import { parseCommonArgs } from "./args.mts";
import { rejectUnknownFlags } from "./unknown-flags.mts";
import { rejectRemovedFlags } from "./removed-flags.mts";
import { USAGE } from "./help.mts";
import { formatSuggestionPatchesResult, formatMarkFilesAsViewedResult } from "./formatters.mts";
import { parseSuggestionPatchGroups } from "./suggestion-patch-flags.mts";
import { hasInvalidIterateFlags, parseIterateFlags } from "./iterate-flags.mts";
import { emitIterateResult } from "./iterate-emitter.mts";
import { emitPollSummaryResult } from "./poll-summary-emitter.mts";
import { parsePollTargets, resolvePollTargets } from "./poll-targets.mts";
import { parseMarkFilesAsViewedArgs } from "./mark-files-as-viewed-flags.mts";

const SUGGEST_FLAGS = ["--thread-id", "--message", "--description"];

export async function handleSuggest(args: string[]): Promise<void> {
  if (rejectUnknownFlags(args, "suggest", SUGGEST_FLAGS)) return;
  const { prNumber, global: globalOpts, extra } = parseCommonArgs(args);
  const parsed = parseSuggestionPatchGroups(extra);
  if (!parsed.ok) {
    process.stderr.write(`${parsed.error}\n${USAGE.suggest}\n`);
    process.exitCode = EXIT.USAGE;
    return;
  }
  const result = await runSuggestionPatches({
    ...globalOpts,
    prNumber,
    suggestions: parsed.suggestions,
  });
  process.stdout.write(
    globalOpts.format === "json"
      ? `${JSON.stringify(result, null, 2)}\n`
      : `${formatSuggestionPatchesResult(result)}\n`,
  );
}

const ITERATE_FLAGS = [
  "--ready-delay",
  "--stall-timeout",
  "--no-auto-mark-ready",
  "--merge",
  "--instructions",
];

/** `iterate [PR...]`: one tick for one PR, or one aggregate tick for several. */
export async function handleIterate(args: string[]): Promise<void> {
  if (rejectRemovedFlags(args) || rejectUnknownFlags(args, "iterate", ITERATE_FLAGS)) return;
  const targets = parsePollTargets(args);
  if (!targets) return;
  const resolved = targets.refs.length > 1 ? await resolvePollTargets(targets) : { prNumbers: [] };
  // Duplicate references collapse to one PR, which takes the single-PR tick.
  if (resolved.prNumbers.length > 1) {
    const flags = parseIterateFlags(targets.extra, loadConfig());
    if (hasInvalidIterateFlags(flags)) return;
    const result = await runPollSummaryTick({
      ...targets.global,
      ...resolved,
      readyDelaySeconds: flags.readyDelaySeconds,
      stallTimeoutSeconds: flags.stallTimeoutSeconds,
      noAutoMarkReady: flags.noAutoMarkReady,
      merge: flags.merge,
      instructions: flags.instructions ?? undefined,
    });
    emitPollSummaryResult(result, { format: targets.global.format });
    return;
  }

  const { prNumber, global: globalOpts, extra } = parseCommonArgs(args);
  const flags = parseIterateFlags(extra, loadConfig());
  if (hasInvalidIterateFlags(flags)) return;

  const result = await runIterateTick({
    ...globalOpts,
    prNumber,
    readyDelaySeconds: flags.readyDelaySeconds,
    stallTimeoutSeconds: flags.stallTimeoutSeconds,
    noAutoMarkReady: flags.noAutoMarkReady,
    merge: flags.merge,
    instructions: flags.instructions ?? undefined,
  });

  emitIterateResult(result, {
    format: globalOpts.format,
    verbose: globalOpts.verbose ?? false,
    readyDelaySuffix: flags.readyDelaySuffix ?? undefined,
  });
}

export async function handleMarkFilesAsViewed(args: string[]): Promise<void> {
  const command = "apply files";
  const { prNumber, global: globalOpts, extra } = parseCommonArgs(args);
  const parsed = parseMarkFilesAsViewedArgs(extra);
  if (!parsed.ok) {
    process.stderr.write(`pr-shepherd: ${command}: ${parsed.error}\n`);
    process.exitCode = EXIT.USAGE;
    return;
  }

  const result = await runMarkFilesAsViewed({
    ...globalOpts,
    prNumber,
    files: parsed.files,
    tests: parsed.tests,
    matchPatterns: parsed.matchPatterns,
  });

  process.stdout.write(
    globalOpts.format === "json"
      ? `${JSON.stringify(result, null, 2)}\n`
      : `${formatMarkFilesAsViewedResult(result)}\n`,
  );
}
