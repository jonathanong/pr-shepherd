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
 *                              [--stall-timeout <duration>] [--no-auto-mark-ready]
 *                              [--no-auto-cancel-actionable]
 *   pr-shepherd status PR1 [PR2 …]
 */

import { readFileSync } from "node:fs";

import { runCheck } from "./commands/check.mts";
import { runResolveFetch, runResolveMutate } from "./commands/resolve.mts";
import { formatJson } from "./reporters/json.mts";
import { formatText } from "./reporters/text.mts";
import { parseCommonArgs, getFlag, hasFlag, parseList, statusToExitCode } from "./cli/args.mts";
import { formatFetchResult, formatMutateResult } from "./cli/formatters.mts";
import { handleCommitSuggestion, handleIterate, handleStatus } from "./cli/handlers.mts";

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
