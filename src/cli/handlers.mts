import { runCommitSuggestion } from "../commands/commit-suggestion.mts";
import { runIterate } from "../commands/iterate.mts";
import { runMonitor, formatMonitorResult, formatMonitorJson } from "../commands/monitor.mts";
import { runStatus, formatStatusTable } from "../commands/status.mts";
import { getRepoInfo } from "../github/client.mts";
import { loadConfig } from "../config/load.mts";
import { detectAgentRuntime } from "../agent-runtime.mts";
import {
  parseCommonArgs,
  getFlag,
  hasFlag,
  parseStatusPrNumbers,
  parseIntStrict,
} from "./args.mts";
import {
  parseDurationToMinutes,
  iterateActionToExitCode,
  deriveSimpleReady,
} from "./exit-codes.mts";
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
  const cooldownSecondsStr = getFlag(extra, "--cooldown-seconds");
  const cooldownSeconds = cooldownSecondsStr
    ? parseIntStrict(cooldownSecondsStr, "--cooldown-seconds")
    : cfg.iterate.cooldownSeconds;
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
    cooldownSeconds,
    stallTimeoutSeconds,
    noAutoMarkReady,
    noAutoCancelActionable,
  });

  const projectionOpts = { runtime, readyDelaySuffix, retryInterval: cfg.watch.interval };
  if (globalOpts.format === "json") {
    const output = globalOpts.verbose
      ? projectIterateVerbose(result, projectionOpts)
      : projectIterateLean(result, projectionOpts);
    process.stdout.write(`${JSON.stringify(output)}\n`);
  } else {
    process.stdout.write(
      `${formatIterateResult(result, {
        verbose: globalOpts.verbose,
        ...projectionOpts,
      })}\n`,
    );
  }

  process.exitCode = iterateActionToExitCode(result.action);
}

export async function handleMonitor(args: string[]): Promise<void> {
  const { prNumber, global: globalOpts, extra } = parseCommonArgs(args);
  const runtime = detectAgentRuntime();

  const readyDelayStr = getFlag(extra, "--ready-delay");
  const readyDelaySuffix = validateDurationFlag(
    "pr-shepherd monitor",
    "--ready-delay",
    readyDelayStr,
    hasFlag(extra, "--ready-delay"),
  );
  if (readyDelaySuffix === null) return;
  const remaining: string[] = [];
  for (let i = 0; i < extra.length; i++) {
    const a = extra[i]!;
    if (a === "--ready-delay") {
      i++;
      continue;
    }
    if (a.startsWith("--ready-delay=")) continue;
    remaining.push(a);
  }
  const unknownFlags = remaining.filter((a) => a.startsWith("--"));
  if (unknownFlags.length > 0) {
    process.stderr.write(
      `pr-shepherd monitor: ignoring unknown flags: ${unknownFlags.join(" ")}\n`,
    );
  }
  const unknownPositionals = remaining.filter((a) => !a.startsWith("--"));
  if (unknownPositionals.length > 0) {
    process.stderr.write(
      `pr-shepherd monitor: unexpected positional arguments ignored: ${unknownPositionals.join(" ")}\n`,
    );
  }

  let result;
  try {
    result = await runMonitor({
      ...globalOpts,
      prNumber,
      readyDelaySuffix: readyDelaySuffix ?? undefined,
      runtime,
    });
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    globalOpts.format === "json"
      ? `${JSON.stringify(formatMonitorJson(result, { runtime }), null, 2)}\n`
      : `${formatMonitorResult(result, { runtime })}\n`,
  );
}

export async function handleStatus(args: string[]): Promise<void> {
  const { global: globalOpts } = parseCommonArgs(args);

  const prNumbers = parseStatusPrNumbers(args);

  if (prNumbers.length === 0) {
    process.stderr.write("Usage: pr-shepherd status PR1 [PR2 …]\n");
    process.exitCode = 1;
    return;
  }

  const repo = await getRepoInfo();
  const summaries = await runStatus({ ...globalOpts, prNumbers });
  const output =
    globalOpts.format === "json"
      ? JSON.stringify(summaries, null, 2)
      : formatStatusTable(summaries, `${repo.owner}/${repo.name}`);

  process.stdout.write(`${output}\n`);

  const allReady = summaries.every((s) => deriveSimpleReady(s));
  process.exitCode = allReady ? 0 : 1;
}
