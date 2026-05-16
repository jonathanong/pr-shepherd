import { runCommitSuggestion } from "../commands/commit-suggestion.mts";
import { runIterate } from "../commands/iterate/index.mts";
import { runClean, type CleanVariant } from "../commands/clean.mts";
import { loadConfig } from "../config/load.mts";
import { parseCommonArgs, getFlag } from "./args.mts";
import { USAGE } from "./help.mts";
import { formatCommitSuggestionResult, formatCleanResult } from "./formatters.mts";
import { parseIterateFlags } from "./iterate-flags.mts";
import { emitIterateResult } from "./iterate-emitter.mts";

const CLEAN_VARIANTS = new Set<string>(["pr", "branch", "current", "repo", "all"]);

export async function handleClean(args: string[]): Promise<void> {
  const variant = args[0];

  if (!variant || !CLEAN_VARIANTS.has(variant)) {
    process.stderr.write(`${USAGE.clean}\n`);
    process.exitCode = 1;
    return;
  }

  const rest = args.slice(1);

  for (const a of rest) {
    if (!a.startsWith("--")) continue;
    if (a === "--dry-run" || a === "--format" || a.startsWith("--format=")) continue;
    process.stderr.write(`pr-shepherd: clean: unknown flag: "${a}"\n`);
    process.exitCode = 1;
    return;
  }

  const fmtIdx = rest.indexOf("--format");
  const fmtEqEntry = rest.find((a) => a.startsWith("--format="));
  let formatValue: string | undefined;
  if (fmtEqEntry !== undefined) {
    formatValue = fmtEqEntry.slice("--format=".length);
  } else if (fmtIdx !== -1 && fmtIdx + 1 < rest.length && !rest[fmtIdx + 1]!.startsWith("--")) {
    formatValue = rest[fmtIdx + 1];
  }
  if (formatValue !== undefined && formatValue !== "text" && formatValue !== "json") {
    process.stderr.write(
      `pr-shepherd: clean: invalid --format value: "${formatValue}". Expected "text" or "json".\n`,
    );
    process.exitCode = 1;
    return;
  }

  const jsonOut = formatValue === "json";
  const dryRun = rest.includes("--dry-run");
  // Skip the value consumed by --format <value> so it isn't mistaken for the positional.
  const flagConsumedIndices = new Set<number>();
  if (fmtIdx !== -1 && fmtIdx + 1 < rest.length && !rest[fmtIdx + 1]!.startsWith("--")) {
    flagConsumedIndices.add(fmtIdx);
    flagConsumedIndices.add(fmtIdx + 1);
  }
  const positionals = rest.filter((a, i) => !flagConsumedIndices.has(i) && !a.startsWith("--"));
  if (positionals.length > 1) {
    process.stderr.write(
      `pr-shepherd: clean: too many positional arguments (expected at most 1, got ${positionals.length})\n`,
    );
    process.exitCode = 1;
    return;
  }
  const value = positionals[0];

  const result = await runClean({ variant: variant as CleanVariant, value, dryRun });

  if (!result.ok) {
    process.stderr.write(`pr-shepherd: clean: ${result.error}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    jsonOut ? `${JSON.stringify(result, null, 2)}\n` : `${formatCleanResult(result)}\n`,
  );
}

export async function handleCommitSuggestion(args: string[]): Promise<void> {
  const { prNumber, global: globalOpts, extra } = parseCommonArgs(args);

  const threadId = getFlag(extra, "--thread-id");
  if (!threadId) {
    process.stderr.write(`${USAGE["commit-suggestion"]}\n`);
    process.exitCode = 1;
    return;
  }

  const message = getFlag(extra, "--message") ?? undefined;

  if (!message || message.trim() === "") {
    process.stderr.write("--message is required and must be non-empty\n");
    process.exitCode = 1;
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

export async function handleIterate(args: string[]): Promise<void> {
  const { prNumber, global: globalOpts, extra } = parseCommonArgs(args);
  const cfg = loadConfig();

  const flags = parseIterateFlags(extra, cfg);
  if (flags.readyDelaySuffix === null) return;

  const result = await runIterate({
    ...globalOpts,
    prNumber,
    readyDelaySeconds: flags.readyDelaySeconds,
    stallTimeoutSeconds: flags.stallTimeoutSeconds,
    noAutoMarkReady: flags.noAutoMarkReady,
    noAutoCancelActionable: flags.noAutoCancelActionable,
  });

  emitIterateResult(result, {
    format: globalOpts.format,
    verbose: globalOpts.verbose ?? false,
    readyDelaySuffix: flags.readyDelaySuffix ?? undefined,
    runner: cfg.cli?.runner,
  });
}
