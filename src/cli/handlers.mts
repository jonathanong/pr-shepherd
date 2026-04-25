import { runCommitSuggestion } from "../commands/commit-suggestion.mts";
import { runIterate } from "../commands/iterate.mts";
import { runMonitor, formatMonitorResult } from "../commands/monitor.mts";
import { runStatus, formatStatusTable } from "../commands/status.mts";
import { getRepoInfo } from "../github/client.mts";
import { loadConfig } from "../config/load.mts";
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
import { formatCommitSuggestionResult, formatIterateResult, projectIterateLean } from "./formatters.mts";

export async function handleCommitSuggestion(args: string[]): Promise<void> {
  const { prNumber, global: globalOpts, extra } = parseCommonArgs(args);

  const threadId = getFlag(extra, "--thread-id");
  if (!threadId) {
    process.stderr.write(
      "Usage: pr-shepherd commit-suggestion [PR] --thread-id ID [--message MSG] [--description DESC] [--dry-run]\n" +
        "       (--message is required unless --dry-run is set)\n",
    );
    process.exitCode = 1;
    return;
  }

  const dryRun = hasFlag(extra, "--dry-run");
  const message = getFlag(extra, "--message") ?? undefined;

  if (!dryRun && (!message || message.trim() === "")) {
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
    dryRun,
  });

  process.stdout.write(
    globalOpts.format === "json"
      ? `${JSON.stringify(result, null, 2)}\n`
      : formatCommitSuggestionResult(result),
  );

  if (result.dryRun) {
    process.exitCode = result.valid ? 0 : 1;
  } else {
    process.exitCode = result.applied ? 0 : 1;
  }
}

export async function handleIterate(args: string[]): Promise<void> {
  const { prNumber, global: globalOpts, extra } = parseCommonArgs(args);

  const readyDelayStr = getFlag(extra, "--ready-delay");
  const cfg = loadConfig();
  const readyDelaySeconds =
    parseDurationToMinutes(readyDelayStr ?? "", cfg.watch.readyDelayMinutes) * 60;
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

  if (globalOpts.format === "json") {
    const output = globalOpts.verbose ? result : projectIterateLean(result);
    process.stdout.write(`${JSON.stringify(output)}\n`);
  } else {
    process.stdout.write(`${formatIterateResult(result, { verbose: globalOpts.verbose })}\n`);
  }

  process.exitCode = iterateActionToExitCode(result.action);
}

export async function handleMonitor(args: string[]): Promise<void> {
  const { prNumber, global: globalOpts, extra } = parseCommonArgs(args);

  const readyDelayStr = getFlag(extra, "--ready-delay");
  if (
    hasFlag(extra, "--ready-delay") &&
    (readyDelayStr === null || readyDelayStr.startsWith("--"))
  ) {
    process.stderr.write(
      "pr-shepherd monitor: --ready-delay requires a value (e.g. --ready-delay 15m)\n",
    );
    process.exitCode = 1;
    return;
  }
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
      readyDelaySuffix: readyDelayStr ?? undefined,
    });
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    globalOpts.format === "json"
      ? `${JSON.stringify(result, null, 2)}\n`
      : `${formatMonitorResult(result)}\n`,
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
