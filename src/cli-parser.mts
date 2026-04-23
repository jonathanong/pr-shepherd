/**
 * CLI argument parsing and subcommand dispatch for pr-shepherd.
 *
 * Usage:
 *   pr-shepherd --version
 *   pr-shepherd check [PR] [--format text|json] [--no-cache] [--cache-ttl N]
 *   pr-shepherd resolve [PR] [--fetch] [--resolve-thread-ids A,B] [--minimize-comment-ids X,Y]
 *                            [--dismiss-review-ids Q] [--message MSG] [--require-sha SHA]
 *                            [--last-push-time N]
 *   pr-shepherd commit-suggestion [PR] --thread-id ID --message MSG [--description DESC]
 *                                      [--format text|json]
 *   pr-shepherd iterate [PR] [--format text|json] [--cooldown-seconds N] [--ready-delay Nm] [--last-push-time N]
 *                              [--stall-timeout <duration>] [--no-auto-rerun] [--no-auto-mark-ready]
 *                              [--no-auto-cancel-actionable]
 *   pr-shepherd status PR1 [PR2 …]
 */

import { readFileSync } from "node:fs";

import { runCheck } from "./commands/check.mts";
import { runResolveFetch, runResolveMutate } from "./commands/resolve.mts";
import { runCommitSuggestion } from "./commands/commit-suggestion.mts";
import { runIterate, renderResolveCommand } from "./commands/iterate.mts";
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
  parseIntStrict,
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

  if (subcommand === "--version" || subcommand === "-v") {
    process.stdout.write(`${readVersion()}\n`);
    return;
  }

  switch (subcommand) {
    case "check":
      await handleCheck(args.slice(1));
      break;
    case "resolve":
      await handleResolve(args.slice(1));
      break;
    case "commit-suggestion":
      await handleCommitSuggestion(args.slice(1));
      break;
    case "iterate":
      await handleIterate(args.slice(1));
      break;
    case "status":
      await handleStatus(args.slice(1));
      break;
    default:
      process.stderr.write(`Unknown subcommand: ${subcommand ?? "(none)"}\n`);
      process.stderr.write(
        "Usage: pr-shepherd <check|resolve|commit-suggestion|iterate|status> [options]\n" +
          "       pr-shepherd --version | -v\n",
      );
      process.exitCode = 1;
      return;
  }
}

function readVersion(): string {
  const pkgUrl = new URL("../package.json", import.meta.url);
  const pkg = JSON.parse(readFileSync(pkgUrl, "utf8")) as { version: string };
  return pkg.version;
}

// ---------------------------------------------------------------------------
// Subcommand handlers
// ---------------------------------------------------------------------------

async function handleCheck(args: string[]): Promise<void> {
  const { prNumber, global: globalOpts } = parseCommonArgs(args);

  const report = await runCheck({ ...globalOpts, prNumber, autoResolve: false });
  const output = globalOpts.format === "json" ? formatJson(report) : formatText(report);
  process.stdout.write(`${output}\n`);

  process.exitCode = statusToExitCode(report.status);
  return;
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

async function handleCommitSuggestion(args: string[]): Promise<void> {
  const { prNumber, global: globalOpts, extra } = parseCommonArgs(args);

  const threadId = getFlag(extra, "--thread-id");
  if (!threadId) {
    process.stderr.write(
      "Usage: pr-shepherd commit-suggestion [PR] --thread-id ID --message MSG [--description DESC]\n",
    );
    process.exitCode = 1;
    return;
  }

  const message = getFlag(extra, "--message");
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
      : formatCommitSuggestionResult(result),
  );

  process.exitCode = result.applied ? 0 : 1;
}

async function handleIterate(args: string[]): Promise<void> {
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
  const noAutoRerun = hasFlag(extra, "--no-auto-rerun");
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
    noAutoRerun,
    noAutoMarkReady,
    noAutoCancelActionable,
  });

  if (globalOpts.format === "json") {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    process.stdout.write(`${formatIterateResult(result)}\n`);
  }

  process.exitCode = iterateActionToExitCode(result.action);
  return;
}

async function handleStatus(args: string[]): Promise<void> {
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
  return;
}

// ---------------------------------------------------------------------------
// Output formatters
// ---------------------------------------------------------------------------

function formatFetchResult(result: Awaited<ReturnType<typeof runResolveFetch>>): string {
  const lines: string[] = [];

  if (result.actionableThreads.length > 0) {
    lines.push(
      `\nActionable Review Threads (${result.actionableThreads.length})` +
        (result.commitSuggestionsEnabled ? " [commit-suggestions: enabled]" : "") +
        ":",
    );
    for (const t of result.actionableThreads) {
      const suggestionMarker = t.suggestion ? " [suggestion]" : "";
      lines.push(
        `  - threadId=${t.id} ${t.path ?? ""}:${t.line ?? "?"} (@${t.author})${suggestionMarker}: ${t.body.split("\n")[0]?.slice(0, 100) ?? ""}`,
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

  if (result.reviewSummaries.length > 0) {
    lines.push(`\nReview summaries (${result.reviewSummaries.length}):`);
    for (const r of result.reviewSummaries) {
      lines.push(`  - reviewId=${r.id} (@${r.author}): ${r.body.split("\n")[0]!.slice(0, 100)}`);
    }
  }

  const total =
    result.actionableThreads.length +
    result.actionableComments.length +
    result.changesRequestedReviews.length +
    result.reviewSummaries.length;
  lines.push(
    `\nSummary: ${total === 0 ? "0 actionable — all threads resolved/minimized" : `${total} actionable item(s)`}`,
  );

  return `${lines.join("\n")}\n`;
}

function formatCommitSuggestionResult(
  result: Awaited<ReturnType<typeof runCommitSuggestion>>,
): string {
  const lines: string[] = [];
  if (result.applied) {
    lines.push(`Applied suggestion from @${result.author}:`);
    const range =
      result.startLine === result.endLine
        ? `line ${result.startLine}`
        : `lines ${result.startLine}-${result.endLine}`;
    lines.push(`  ${result.path} (${range})`);
    if (result.commitSha) lines.push(`Commit: ${result.commitSha}`);
    if (result.patch) {
      lines.push("");
      lines.push("```diff");
      lines.push(result.patch.trimEnd());
      lines.push("```");
    }
  } else {
    lines.push(`Failed to apply suggestion ${result.threadId}:`);
    lines.push(`  path: ${result.path} (lines ${result.startLine}-${result.endLine})`);
    lines.push(`  author: @${result.author}`);
    lines.push(`  reason: ${result.reason ?? "unknown"}`);
    if (result.patch) {
      lines.push("");
      lines.push("```diff");
      lines.push(result.patch.trimEnd());
      lines.push("```");
    }
  }
  if (result.postActionInstruction) {
    lines.push("");
    lines.push(result.postActionInstruction);
  }
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

/**
 * Format an IterateResult as human-readable Markdown.
 *
 * Load-bearing conventions the monitor SKILL relies on:
 *   1. The H1 heading on line 1 contains `[<ACTION>]` — the SKILL greps this tag.
 *   2. `[FIX_CODE]` always uses the `rebase-and-push` variant: the `resolve`
 *      bullet under `## Post-fix push` wraps the resolve command in backticks —
 *      the SKILL extracts the backticked content for execution.
 *   3. The shell script under `[REBASE]` is inside a ```bash fenced block.
 *   4. `## Instructions` items are numbered `1.`, `2.`, … and executed in order.
 */
function formatIterateResult(result: import("./types.mts").IterateResult): string {
  const heading = `# PR #${result.pr} [${result.action.toUpperCase()}]`;
  const baseLine = `**status** \`${result.status}\` · **merge** \`${result.mergeStateStatus}\` · **state** \`${result.state}\` · **repo** \`${result.repo}\``;
  const summaryLine = `**summary** ${result.summary.passing} passing, ${result.summary.skipped} skipped, ${result.summary.filtered} filtered, ${result.summary.inProgress} inProgress · **remainingSeconds** ${result.remainingSeconds} · **copilotReviewInProgress** ${result.copilotReviewInProgress} · **isDraft** ${result.isDraft} · **shouldCancel** ${result.shouldCancel}`;
  const header = [heading, "", baseLine, summaryLine].join("\n");

  switch (result.action) {
    case "cooldown":
    case "wait":
    case "cancel":
    case "rerun_ci":
    case "mark_ready":
      return [header, "", result.log].join("\n");

    case "rebase":
      return [
        header,
        "",
        result.rebase.reason,
        "",
        "```bash",
        result.rebase.shellScript,
        "```",
      ].join("\n");

    case "escalate":
      return [header, "", result.escalate.humanMessage].join("\n");

    case "fix_code":
      return formatFixCodeResult(header, result);
  }
}

function formatFixCodeResult(
  header: string,
  result: import("./types.mts").IterateResultFixCode,
): string {
  const sections: string[] = [header];

  // Threads section is shared between both fix modes — render it first so the
  // human/agent sees what is about to be applied.
  if (result.fix.threads.length > 0) {
    sections.push("## Review threads");
    for (const t of result.fix.threads) {
      const loc = t.path ? `\`${t.path}:${t.line ?? "?"}\`` : "(no location)";
      sections.push(`### \`${t.id}\` — ${loc} (@${t.author})`);
      sections.push(blockquote(t.body));
    }
  }

  if (result.fix.actionableComments.length > 0) {
    sections.push("## Actionable comments");
    for (const c of result.fix.actionableComments) {
      sections.push(`### \`${c.id}\` (@${c.author})`);
      sections.push(blockquote(c.body));
    }
  }

  if (result.fix.checks.length > 0) {
    sections.push("## Failing checks");
    const bullets = result.fix.checks.map((ch) => {
      const kind = ch.failureKind ?? "actionable";
      if (ch.runId) return `- \`${ch.runId}\` — \`${ch.name}\` (${kind})`;
      if (ch.detailsUrl) return `- external \`${ch.detailsUrl}\` — \`${ch.name}\` (${kind})`;
      return `- (no runId) — \`${ch.name}\` (${kind})`;
    });
    sections.push(bullets.join("\n"));
  }

  if (result.fix.changesRequestedReviews.length > 0) {
    sections.push("## Changes-requested reviews");
    sections.push(
      result.fix.changesRequestedReviews.map((r) => `- \`${r.id}\` (@${r.author})`).join("\n"),
    );
  }

  if (result.fix.noiseCommentIds.length > 0) {
    sections.push("## Noise (minimize only)");
    sections.push(result.fix.noiseCommentIds.map((id) => `\`${id}\``).join(", "));
  }

  if (result.fix.reviewSummaryIds.length > 0) {
    sections.push("## Review summaries (minimize only)");
    sections.push(result.fix.reviewSummaryIds.map((id) => `\`${id}\``).join(", "));
  }

  if (result.fix.surfacedSummaries.length > 0) {
    sections.push("## Review summaries (surfaced — not minimized)");
    for (const r of result.fix.surfacedSummaries) {
      sections.push(`### \`${r.id}\` (@${r.author})`);
      sections.push(blockquote(r.body));
    }
  }

  if (result.cancelled.length > 0) {
    sections.push("## Cancelled runs");
    sections.push(result.cancelled.map((id) => `\`${id}\``).join(", "));
  }

  sections.push("## Post-fix push");
  sections.push(
    [
      `- base: \`${result.baseBranch}\``,
      `- resolve: \`${renderResolveCommand(result.fix.resolveCommand)}\``,
    ].join("\n"),
  );

  if (result.fix.instructions.length > 0) {
    sections.push("## Instructions");
    sections.push(result.fix.instructions.map((inst, i) => `${i + 1}. ${inst}`).join("\n"));
  }

  return sections.join("\n\n");
}

function blockquote(body: string): string {
  return body
    .split("\n")
    .map((line) => (line === "" ? ">" : `> ${line}`))
    .join("\n");
}
