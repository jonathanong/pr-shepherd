import { runCommitSuggestion } from "../commands/commit-suggestion.mts";
import { runSuggestionPatches } from "../commands/suggestion-patches.mts";
import { runMarkFilesAsViewed } from "../commands/mark-files-as-viewed.mts";
import { runIterateForMode } from "../commands/event-mode.mts";
import { loadConfig } from "../config/load.mts";
import { EXIT } from "../exit-codes.mts";
import { parseCommonArgs, getFlag } from "./args.mts";
import { USAGE } from "./help.mts";
import {
  formatCommitSuggestionResult,
  formatSuggestionPatchesResult,
  formatMarkFilesAsViewedResult,
} from "./formatters.mts";
import { parseSuggestionPatchGroups } from "./suggestion-patch-flags.mts";
import { hasInvalidIterateFlags, parseIterateFlags } from "./iterate-flags.mts";
import { emitIterateResult } from "./iterate-emitter.mts";
import { parseMarkFilesAsViewedArgs } from "./mark-files-as-viewed-flags.mts";

export async function handleCommitSuggestion(
  args: string[],
  command: "build-suggestion-patch" | "commit-suggestion" = "build-suggestion-patch",
): Promise<void> {
  const { prNumber, global: globalOpts, extra } = parseCommonArgs(args);

  const threadId = getFlag(extra, "--thread-id");
  if (!threadId) {
    process.stderr.write(`${USAGE[command]}\n`);
    process.exitCode = EXIT.USAGE;
    return;
  }

  const message = getFlag(extra, "--message") ?? undefined;

  if (!message || message.trim() === "") {
    process.stderr.write("--message is required and must be non-empty\n");
    process.exitCode = EXIT.USAGE;
    return;
  }

  const description = getFlag(extra, "--description") ?? undefined;

  const result = await runCommitSuggestion({
    ...globalOpts,
    prNumber,
    threadId,
    message,
    description,
  });

  process.stdout.write(
    globalOpts.format === "json"
      ? `${JSON.stringify(result, null, 2)}\n`
      : `${formatCommitSuggestionResult(result)}\n`,
  );
}

export async function handleSuggestionPatches(args: string[]): Promise<void> {
  const { prNumber, global: globalOpts, extra } = parseCommonArgs(args);
  const parsed = parseSuggestionPatchGroups(extra);
  if (!parsed.ok) {
    process.stderr.write(`${parsed.error}\n${USAGE["build-suggestion-patches"]}\n`);
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

export async function handleIterate(args: string[]): Promise<void> {
  const { prNumber, global: globalOpts, extra } = parseCommonArgs(args);
  const flags = parseIterateFlags(extra, loadConfig());
  if (hasInvalidIterateFlags(flags)) return;

  const result = await runIterateForMode({
    ...globalOpts,
    prNumber,
    readyDelaySeconds: flags.readyDelaySeconds,
    stallTimeoutSeconds: flags.stallTimeoutSeconds,
    noAutoMarkReady: flags.noAutoMarkReady,
    noAutoCancelActionable: flags.noAutoCancelActionable,
    merge: flags.merge,
    instructions: flags.instructions ?? undefined,
    pollMode: flags.pollMode ?? undefined,
  });

  emitIterateResult(result, {
    format: globalOpts.format,
    verbose: globalOpts.verbose ?? false,
    readyDelaySuffix: flags.readyDelaySuffix ?? undefined,
  });
}

export async function handleMarkFilesAsViewed(
  args: string[],
  command: "apply files" | "mark-files-as-viewed" = "apply files",
): Promise<void> {
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
