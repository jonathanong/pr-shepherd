/**
 * CLI argument parsing and subcommand dispatch for pr-shepherd.
 *
 * Usage:
 *   pr-shepherd check [PR] [--format text|json] [--no-cache] [--cache-ttl N]
 *   pr-shepherd resolve [PR] [--fetch] [--resolve-thread-ids A,B] [--minimize-comment-ids X,Y]
 *                            [--dismiss-review-ids Q] [--message MSG] [--require-sha SHA]
 *                            [--last-push-time N]
 *   pr-shepherd iterate [PR] [--cooldown-seconds N] [--ready-delay Nm] [--last-push-time N]
 *   pr-shepherd status PR1 [PR2 …]
 */

import { runCheck } from "./commands/check.mts";
import { runResolveFetch, runResolveMutate } from "./commands/resolve.mts";
import { runIterate } from "./commands/iterate.mts";
import { runStatus, formatStatusTable } from "./commands/status.mts";
import { getRepoInfo } from "./github/client.mts";
import { formatJson } from "./reporters/json.mts";
import { formatText } from "./reporters/text.mts";
import { loadConfig } from "./config/load.mts";
import {
  parseCommonArgs,
  getFlag,
  hasFlag,
  parseList,
  parseStatusPrNumbers,
  parseDurationToMinutes,
  statusToExitCode,
  iterateActionToExitCode,
  deriveSimpleReady,
} from "./cli/args.mts";

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

export async function main(argv: string[]): Promise<void> {
  const args = argv.slice(2); // strip node + script path

  const subcommand = args[0];

  switch (subcommand) {
    case "check":
      await handleCheck(args.slice(1));
      break;
    case "resolve":
      await handleResolve(args.slice(1));
      break;
    case "iterate":
      await handleIterate(args.slice(1));
      break;
    case "status":
      await handleStatus(args.slice(1));
      break;
    default:
      process.stderr.write(`Unknown subcommand: ${subcommand ?? "(none)"}\n`);
      process.stderr.write("Usage: pr-shepherd <check|resolve|iterate|status> [options]\n");
      process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Subcommand handlers
// ---------------------------------------------------------------------------

async function handleCheck(args: string[]): Promise<void> {
  const { prNumber, global: globalOpts } = parseCommonArgs(args);

  const report = await runCheck({ ...globalOpts, prNumber, autoResolve: false });
  const output = globalOpts.format === "json" ? formatJson(report) : formatText(report);
  process.stdout.write(`${output}\n`);

  process.exit(statusToExitCode(report.status));
}

async function handleResolve(args: string[]): Promise<void> {
  const { prNumber, global: globalOpts, extra } = parseCommonArgs(args);

  const resolveThreadIds = parseList(getFlag(extra, "--resolve-thread-ids"));
  const minimizeCommentIds = parseList(getFlag(extra, "--minimize-comment-ids"));
  const dismissReviewIds = parseList(getFlag(extra, "--dismiss-review-ids"));
  const dismissMessage = getFlag(extra, "--message") ?? undefined;
  const requireSha = getFlag(extra, "--require-sha") ?? undefined;
  const fetchMode =
    hasFlag(extra, "--fetch") ||
    (resolveThreadIds.length === 0 &&
      minimizeCommentIds.length === 0 &&
      dismissReviewIds.length === 0);

  if (fetchMode) {
    const result = await runResolveFetch({ ...globalOpts, prNumber });
    process.stdout.write(
      globalOpts.format === "json"
        ? `${JSON.stringify(result, null, 2)}\n`
        : formatFetchResult(result),
    );
  } else {
    const result = await runResolveMutate({
      ...globalOpts,
      prNumber,
      resolveThreadIds,
      minimizeCommentIds,
      dismissReviewIds,
      dismissMessage,
      requireSha,
    });
    process.stdout.write(
      globalOpts.format === "json"
        ? `${JSON.stringify(result, null, 2)}\n`
        : formatMutateResult(result),
    );
  }
}

async function handleIterate(args: string[]): Promise<void> {
  const { prNumber, global: globalOpts, extra } = parseCommonArgs(args);

  const lastPushTimeStr = getFlag(extra, "--last-push-time");
  const lastPushTime = lastPushTimeStr ? parseInt(lastPushTimeStr, 10) : undefined;
  const readyDelayStr = getFlag(extra, "--ready-delay");
  const cfg = loadConfig();
  const readyDelaySeconds = readyDelayStr
    ? parseDurationToMinutes(readyDelayStr) * 60
    : cfg.watch.readyDelayMinutes * 60;
  const cooldownSecondsStr = getFlag(extra, "--cooldown-seconds");
  const cooldownSeconds = cooldownSecondsStr
    ? parseInt(cooldownSecondsStr, 10)
    : cfg.iterate.cooldownSeconds;
  const noAutoRerun = hasFlag(extra, "--no-auto-rerun");
  const noAutoMarkReady = hasFlag(extra, "--no-auto-mark-ready");
  const noAutoCancelActionable = hasFlag(extra, "--no-auto-cancel-actionable");

  const result = await runIterate({
    ...globalOpts,
    prNumber,
    lastPushTime,
    readyDelaySeconds,
    cooldownSeconds,
    noAutoRerun,
    noAutoMarkReady,
    noAutoCancelActionable,
  });

  if (globalOpts.format === "json") {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    process.stdout.write(`${formatIterateResult(result)}\n`);
  }

  process.exit(iterateActionToExitCode(result.action));
}

async function handleStatus(args: string[]): Promise<void> {
  const { global: globalOpts } = parseCommonArgs(args);

  const prNumbers = parseStatusPrNumbers(args);

  if (prNumbers.length === 0) {
    process.stderr.write("Usage: pr-shepherd status PR1 [PR2 …]\n");
    process.exit(1);
  }

  const repo = await getRepoInfo();
  const summaries = await runStatus({ ...globalOpts, prNumbers });
  const output =
    globalOpts.format === "json"
      ? JSON.stringify(summaries, null, 2)
      : formatStatusTable(summaries, `${repo.owner}/${repo.name}`);

  process.stdout.write(`${output}\n`);

  const allReady = summaries.every((s) => deriveSimpleReady(s));
  process.exit(allReady ? 0 : 1);
}

// ---------------------------------------------------------------------------
// Output formatters
// ---------------------------------------------------------------------------

function formatFetchResult(result: Awaited<ReturnType<typeof runResolveFetch>>): string {
  const lines: string[] = [];

  if (result.autoResolved.length > 0) {
    lines.push(`Auto-resolved outdated (${result.autoResolved.length}):`);
    for (const t of result.autoResolved) {
      lines.push(`  - threadId=${t.id} ${t.path ?? ""}:${t.line ?? "?"} (@${t.author})`);
    }
  }

  if (result.actionableThreads.length > 0) {
    lines.push(`\nActionable Review Threads (${result.actionableThreads.length}):`);
    for (const t of result.actionableThreads) {
      lines.push(
        `  - threadId=${t.id} ${t.path ?? ""}:${t.line ?? "?"} (@${t.author}): ${t.body.split("\n")[0]?.slice(0, 100) ?? ""}`,
      );
    }
  }

  if (result.actionableComments.length > 0) {
    lines.push(`\nActionable PR Comments (${result.actionableComments.length}):`);
    for (const c of result.actionableComments) {
      lines.push(
        `  - commentId=${c.id} (@${c.author}): ${c.body.split("\n")[0]?.slice(0, 100) ?? ""}`,
      );
    }
  }

  if (result.changesRequestedReviews.length > 0) {
    lines.push(`\nPending CHANGES_REQUESTED reviews (${result.changesRequestedReviews.length}):`);
    for (const r of result.changesRequestedReviews) {
      lines.push(`  - reviewId=${r.id} (@${r.author})`);
    }
  }

  const total =
    result.actionableThreads.length +
    result.actionableComments.length +
    result.changesRequestedReviews.length;
  lines.push(
    `\nSummary: ${total === 0 ? "0 actionable — all threads resolved/minimized" : `${total} actionable item(s)`}`,
  );

  return `${lines.join("\n")}\n`;
}

function formatMutateResult(result: Awaited<ReturnType<typeof runResolveMutate>>): string {
  const lines: string[] = [];
  if (result.resolvedThreads.length)
    lines.push(
      `Resolved threads (${result.resolvedThreads.length}): ${result.resolvedThreads.join(", ")}`,
    );
  if (result.minimizedComments.length)
    lines.push(
      `Minimized comments (${result.minimizedComments.length}): ${result.minimizedComments.join(", ")}`,
    );
  if (result.dismissedReviews.length)
    lines.push(
      `Dismissed reviews (${result.dismissedReviews.length}): ${result.dismissedReviews.join(", ")}`,
    );
  if (result.errors.length) lines.push(`Errors:\n  ${result.errors.join("\n  ")}`);
  return `${lines.join("\n")}\n`;
}

function formatIterateResult(result: import("./types.mts").IterateResult): string {
  const base = `PR #${result.pr} [${result.action.toUpperCase()}] status=${result.status} merge=${result.mergeStateStatus}`;
  switch (result.action) {
    case "cooldown":
      return `${base} (cooldown: CI still starting)`;
    case "wait":
      return `${base} (${result.remainingSeconds}s until cancel)`;
    case "cancel":
      return `${base} (ready-delay elapsed)`;
    case "fix_code":
      return `${base} threads=${result.fix.threads.length} comments=${result.fix.comments.length} checks=${result.fix.checks.length} cancelled=${result.cancelled.length}`;
    case "rerun_ci":
      return `${base} reran=${result.reran.join(",")}`;
    case "rebase":
      return `${base} (branch is behind main)`;
    case "mark_ready":
      return `${base} markedReady=${result.markedReady}`;
    case "escalate":
      return `${base} triggers=${result.escalate.triggers.join(",")} — ${result.escalate.suggestion}`;
  }
}
