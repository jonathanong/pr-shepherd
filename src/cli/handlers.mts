import { runCommitSuggestion } from "../commands/commit-suggestion.mts";
import { runIterate } from "../commands/iterate/index.mts";
import { runClean, type CleanVariant } from "../commands/clean.mts";
import { loadConfig } from "../config/load.mts";
import { detectAgentRuntime } from "../agent-runtime.mts";
import { parseCommonArgs, getFlag, hasFlag } from "./args.mts";
import { parseDurationToMinutes, iterateActionToExitCode } from "./exit-codes.mts";
import {
  formatCommitSuggestionResult,
  formatCleanResult,
  formatIterateResult,
  projectIterateLean,
  projectIterateVerbose,
} from "./formatters.mts";
import { validateDurationFlag } from "./duration-flag.mts";

const CLEAN_VARIANTS = new Set<string>(["pr", "branch", "current", "repo", "all"]);

export async function handleClean(args: string[]): Promise<void> {
  const variant = args[0];

  if (!variant || !CLEAN_VARIANTS.has(variant)) {
    process.stderr.write(
      "Usage: pr-shepherd clean <pr|branch|current|repo|all> [value] [--dry-run] [--format text|json]\n",
    );
    process.exitCode = 1;
    return;
  }

  const rest = args.slice(1);

  const jsonOut =
    rest.some((a) => a === "--format=json") ||
    (() => {
      const idx = rest.indexOf("--format");
      return idx !== -1 && rest[idx + 1] === "json";
    })();
  const dryRun = rest.includes("--dry-run");
  // First non-flag arg is the optional positional (PR number or branch name).
  const value = rest.find((a) => !a.startsWith("--"));

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
    process.stderr.write(
      "Usage: pr-shepherd commit-suggestion [PR] --thread-id ID --message MSG [--description DESC]\n",
    );
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
  const runtime = detectAgentRuntime();

  const readyDelayStr = getFlag(extra, "--ready-delay");
  const readyDelaySuffix = validateDurationFlag(
    "pr-shepherd",
    "--ready-delay",
    readyDelayStr,
    hasFlag(extra, "--ready-delay"),
  );
  if (readyDelaySuffix === null) return;
  const cfg = loadConfig();
  const readyDelaySeconds =
    parseDurationToMinutes(readyDelaySuffix ?? "", cfg.watch.readyDelayMinutes) * 60;
  const noAutoMarkReady = hasFlag(extra, "--no-auto-mark-ready");
  const noAutoCancelActionable = hasFlag(extra, "--no-auto-cancel-actionable");
  const stallTimeoutStr = getFlag(extra, "--stall-timeout");
  const stallTimeoutSeconds = stallTimeoutStr
    ? parseDurationToMinutes(stallTimeoutStr, cfg.iterate.stallTimeoutMinutes) * 60
    : cfg.iterate.stallTimeoutMinutes * 60;

  const result = await runIterate({
    ...globalOpts,
    prNumber,
    readyDelaySeconds,
    stallTimeoutSeconds,
    noAutoMarkReady,
    noAutoCancelActionable,
  });

  const projectionOpts = {
    runtime,
    readyDelaySuffix,
    runner: cfg.cli?.runner,
  };
  if (globalOpts.format === "json") {
    const output = globalOpts.verbose
      ? projectIterateVerbose(result, projectionOpts)
      : projectIterateLean(result, projectionOpts);
    process.stdout.write(`${JSON.stringify(output)}\n`);
  } else {
    const text = formatIterateResult(result, { verbose: globalOpts.verbose, ...projectionOpts });
    process.stdout.write(`${text}\n`);
  }

  process.exitCode = iterateActionToExitCode(result.action);
}
