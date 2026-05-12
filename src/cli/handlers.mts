import { runCommitSuggestion } from "../commands/commit-suggestion.mts";
import { runIterate } from "../commands/iterate.mts";
import { loadConfig } from "../config/load.mts";
import { detectAgentRuntime } from "../agent-runtime.mts";
import { parseCommonArgs, getFlag, hasFlag } from "./args.mts";
import { parseDurationToMinutes, iterateActionToExitCode } from "./exit-codes.mts";
import {
  formatCommitSuggestionResult,
  formatIterateResult,
  projectIterateLean,
  projectIterateVerbose,
} from "./formatters.mts";
import { validateDurationFlag } from "./duration-flag.mts";

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
