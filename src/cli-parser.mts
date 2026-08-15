/* eslint-disable max-lines */
/** CLI argument parsing and subcommand dispatch for pr-shepherd. See --help for usage. */

import { readFileSync } from "node:fs";

import { EXIT, errorToExitCode } from "./exit-codes.mts";
import { runResolveMutate } from "./commands/resolve.mts";
import { runLogFile } from "./commands/log-file.mts";
import { parseCommonArgs, getFlag, hasFlag, parseList } from "./cli/args.mts";
import { isDefaultPollInvocation, validateDefaultPollArgs } from "./cli/default-poll.mts";
import { USAGE, helpKeyForArgs, maybePrintHelp } from "./cli/help.mts";
import { formatMutateResult } from "./cli/formatters.mts";
import {
  handleClean,
  handleCommitSuggestion,
  handleIterate,
  handleMarkFilesAsViewed,
} from "./cli/handlers.mts";
import { handleJournal } from "./cli/journal-handler.mts";
import { handlePoll } from "./cli/poll-handler.mts";
import {
  warnPrrcThreadIds,
  validateRequireSha,
  rejectPrrcMinimizeIds,
} from "./cli/resolve-validators.mts";
import { setupLog } from "./log/setup.mts";

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

  if (subcommand === "--help" || subcommand === "-h") {
    process.stdout.write(`${USAGE.top}\n`);
    return;
  }

  // log-file must run before the stdout tee and log init to avoid recursion.
  if (subcommand === "log-file") {
    await handleLogFile(args.slice(1));
    return;
  }

  // The public command groups keep admin diagnostics out of the normal
  // command namespace. Keep this before setupLog because log-file reads the
  // log path and must not initialize/tee the log it is reporting.
  if (subcommand === "admin" && args[1] === "log-file") {
    await handleLogFile(args.slice(2), "admin log-file");
    return;
  }

  // Short-circuit all --help/-h before any I/O or logging.
  if (hasFlag(args, "--help") || hasFlag(args, "-h")) {
    if (isDefaultPollInvocation(subcommand)) {
      process.stdout.write(`${USAGE.default}\n`);
    } else {
      process.stdout.write(`${USAGE[helpKeyForArgs(args)]}\n`);
    }
    return;
  }

  const legacyReplacement: Record<string, string> = {
    poll: "pr-shepherd [PR] (the default PR polling command)",
    resolve: "apply review",
    "mark-files-as-viewed": "apply files",
    journal: "apply journal",
    "commit-suggestion": "build-suggestion-patch",
  };
  if (subcommand !== undefined && legacyReplacement[subcommand] !== undefined) {
    warnLegacyAlias(subcommand, legacyReplacement[subcommand]!);
  }

  // Initialize the per-worktree log and install a stdout tee.
  await setupLog(argv);

  if (isDefaultPollInvocation(subcommand)) {
    if (!validateDefaultPollArgs(args)) return;
    await handlePoll(args);
    return;
  }

  switch (subcommand) {
    case "apply":
      await handleApply(args.slice(1));
      break;
    case "build-suggestion-patch":
      await handleCommitSuggestion(args.slice(1));
      break;
    case "admin":
      await handleAdmin(args.slice(1));
      break;
    case "resolve":
      await handleResolve(args.slice(1), "resolve");
      break;
    case "commit-suggestion":
      await handleCommitSuggestion(args.slice(1), "commit-suggestion");
      break;
    case "mark-files-as-viewed":
      await handleMarkFilesAsViewed(args.slice(1), "mark-files-as-viewed");
      break;
    case "iterate":
      await handleIterate(args.slice(1));
      break;
    case "poll":
      await handlePoll(args.slice(1));
      break;
    case "clean":
      await handleClean(args.slice(1), "clean");
      break;
    case "journal":
      await handleJournal(args.slice(1), "journal");
      break;
    default:
      process.stderr.write(`Unknown subcommand: ${subcommand ?? "(none)"}\n`);
      process.stderr.write(`${USAGE.top}\n`);
      process.exitCode = EXIT.USAGE;
      return;
  }
}

function warnLegacyAlias(alias: string, replacement: string): void {
  process.stderr.write(
    `pr-shepherd: ${alias} is deprecated; use ${replacement.startsWith("pr-shepherd") ? replacement : `pr-shepherd ${replacement}`} instead.\n`,
  );
}

async function handleApply(args: string[]): Promise<void> {
  const action = args[0];
  switch (action) {
    case "review":
      await handleResolve(args.slice(1));
      return;
    case "files":
      await handleMarkFilesAsViewed(args.slice(1));
      return;
    case "journal":
      await handleJournal(args.slice(1));
      return;
    default:
      process.stderr.write(`Unknown apply action: ${action ?? "(none)"}\n`);
      process.stderr.write(`${USAGE.apply}\n`);
      process.exitCode = EXIT.USAGE;
  }
}

async function handleAdmin(args: string[]): Promise<void> {
  switch (args[0]) {
    case "clean":
      await handleClean(args.slice(1));
      return;
    default:
      process.stderr.write(`Unknown admin command: ${args[0] ?? "(none)"}\n`);
      process.stderr.write(`${USAGE.admin}\n`);
      process.exitCode = EXIT.USAGE;
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

async function handleLogFile(
  args: string[],
  usageKey: "log-file" | "admin log-file" = "log-file",
): Promise<void> {
  if (maybePrintHelp(args, usageKey)) return;
  const jsonOut =
    args.some((a) => a === "--format=json") ||
    (() => {
      const idx = args.indexOf("--format");
      return idx !== -1 && args[idx + 1] === "json";
    })();

  try {
    const result = await runLogFile();
    process.stdout.write(jsonOut ? `${JSON.stringify(result, null, 2)}\n` : `${result.path}\n`);
  } catch (e) {
    process.stderr.write(`pr-shepherd: log-file: ${String(e)}\n`);
    process.exitCode = errorToExitCode(e);
  }
}

async function handleResolve(
  args: string[],
  command: "apply review" | "resolve" = "apply review",
): Promise<void> {
  const { prNumber, global: globalOpts, extra } = parseCommonArgs(args);

  const resolveThreadIds = parseList(getFlag(extra, "--resolve-thread-ids"));
  const replyThreadIds = parseList(getFlag(extra, "--reply-thread-ids"));
  const minimizeCommentIds = parseList(getFlag(extra, "--minimize-comment-ids"));
  const dismissReviewIds = parseList(getFlag(extra, "--dismiss-review-ids"));
  const dismissMessage = getFlag(extra, "--message") ?? undefined;
  const requireSha = getFlag(extra, "--require-sha") ?? undefined;

  warnPrrcThreadIds(resolveThreadIds);
  if (!validateRequireSha(requireSha)) return;
  if (rejectPrrcMinimizeIds(minimizeCommentIds).length > 0) return;

  if (hasFlag(extra, "--fetch")) {
    process.stderr.write(
      `pr-shepherd: ${command}: --fetch has been removed; run pr-shepherd iterate to fetch the next action.\n`,
    );
    process.exitCode = EXIT.USAGE;
    return;
  }

  const hasAction =
    resolveThreadIds.length > 0 ||
    replyThreadIds.length > 0 ||
    minimizeCommentIds.length > 0 ||
    dismissReviewIds.length > 0;
  if (!hasAction) {
    process.stderr.write(
      `pr-shepherd: ${command}: an action flag is required (--reply-thread-ids, --resolve-thread-ids, --minimize-comment-ids, or --dismiss-review-ids).\n`,
    );
    process.exitCode = EXIT.USAGE;
    return;
  }

  const result = await runResolveMutate({
    ...globalOpts,
    prNumber,
    resolveThreadIds,
    replyThreadIds,
    minimizeCommentIds,
    dismissReviewIds,
    dismissMessage,
    requireSha,
  });
  process.stdout.write(
    globalOpts.format === "json"
      ? `${JSON.stringify(result, null, 2)}\n`
      : `${formatMutateResult(result)}\n`,
  );
}
