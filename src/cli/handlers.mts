import { runCommitSuggestion } from "../commands/commit-suggestion.mts";
import { runIterate } from "../commands/iterate.mts";
import { runStatus, formatStatusTable } from "../commands/status.mts";
import { getRepoInfo } from "../github/client.mts";
import { loadConfig } from "../config/load.mts";
import {
  parseCommonArgs,
  getFlag,
  hasFlag,
  parseStatusPrNumbers,
  parseDurationToMinutes,
  parseIntStrict,
  iterateActionToExitCode,
  deriveSimpleReady,
} from "./args.mts";
import { formatCommitSuggestionResult, formatIterateResult } from "./formatters.mts";

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

  const lastPushTimeStr = getFlag(extra, "--last-push-time");
  const lastPushTime = lastPushTimeStr
    ? parseIntStrict(lastPushTimeStr, "--last-push-time")
    : undefined;
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
    lastPushTime,
    readyDelaySeconds,
    cooldownSeconds,
    stallTimeoutSeconds,
    noAutoMarkReady,
    noAutoCancelActionable,
  });

  if (globalOpts.format === "json") {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    process.stdout.write(`${formatIterateResult(result)}\n`);
  }

  process.exitCode = iterateActionToExitCode(result.action);
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
