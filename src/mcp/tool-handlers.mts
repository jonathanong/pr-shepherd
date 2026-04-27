/** MCP tool handler implementations — one function per tool. */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { runCheck } from "../commands/check.mts";
import { runResolveFetch, runResolveMutate } from "../commands/resolve.mts";
import { runCommitSuggestion } from "../commands/commit-suggestion.mts";
import { runIterate } from "../commands/iterate.mts";
import { runMonitor, formatMonitorResult } from "../commands/monitor.mts";
import { runStatus, formatStatusTable } from "../commands/status.mts";
import { runLogFile } from "../commands/log-file.mts";
import { getRepoInfo } from "../github/client.mts";
import { formatText } from "../reporters/text.mts";
import {
  formatFetchResult,
  formatCommitSuggestionResult,
  formatMutateResult,
  formatIterateResult,
} from "../cli/formatters.mts";
import type { SubscriptionStore } from "./subscriptions.mts";
import {
  optNum,
  reqNum,
  optStr,
  reqStr,
  optBool,
  optStringArray,
  reqNumArray,
} from "./tool-coerce.mts";

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

const TEXT = "text" as const;
const FORMAT_TEXT = { format: TEXT } as const;

export function ok(text: string): CallToolResult {
  return { content: [{ type: TEXT, text }] };
}

export function err(msg: string): CallToolResult {
  return { content: [{ type: TEXT, text: `Error: ${msg}` }], isError: true };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function handleCheck(input: Record<string, unknown>): Promise<CallToolResult> {
  const prNumber = optNum(input, "prNumber");
  const skipTriage = optBool(input, "skipTriage");
  const report = await runCheck({ ...FORMAT_TEXT, prNumber, skipTriage });
  return ok(formatText(report));
}

export async function handleResolveFetch(input: Record<string, unknown>): Promise<CallToolResult> {
  const prNumber = optNum(input, "prNumber");
  const result = await runResolveFetch({ ...FORMAT_TEXT, prNumber });
  return ok(formatFetchResult(result));
}

export async function handleResolveMutate(input: Record<string, unknown>): Promise<CallToolResult> {
  const prNumber = optNum(input, "prNumber");
  const resolveThreadIds = optStringArray(input, "resolveThreadIds");
  const minimizeCommentIds = optStringArray(input, "minimizeCommentIds");
  const dismissReviewIds = optStringArray(input, "dismissReviewIds");
  const dismissMessage = optStr(input, "dismissMessage");
  const requireSha = optStr(input, "requireSha");

  if (!resolveThreadIds?.length && !minimizeCommentIds?.length && !dismissReviewIds?.length) {
    return err("Provide at least one of: resolveThreadIds, minimizeCommentIds, dismissReviewIds");
  }
  if (dismissReviewIds?.length && !dismissMessage) {
    return err("dismissMessage is required when dismissReviewIds is non-empty");
  }
  const result = await runResolveMutate({
    ...FORMAT_TEXT,
    prNumber,
    resolveThreadIds,
    minimizeCommentIds,
    dismissReviewIds,
    dismissMessage,
    requireSha,
  });
  return ok(formatMutateResult(result));
}

export async function handleCommitSuggestion(
  input: Record<string, unknown>,
): Promise<CallToolResult> {
  const prNumber = optNum(input, "prNumber");
  const threadId = reqStr(input, "threadId");
  const message = optStr(input, "message");
  const description = optStr(input, "description");
  const dryRun = optBool(input, "dryRun");
  const result = await runCommitSuggestion({
    ...FORMAT_TEXT,
    prNumber,
    threadId,
    message,
    description,
    dryRun,
  });
  return ok(formatCommitSuggestionResult(result));
}

export async function handleIterate(input: Record<string, unknown>): Promise<CallToolResult> {
  const prNumber = optNum(input, "prNumber");
  const cooldownSeconds = optNum(input, "cooldownSeconds");
  const readyDelaySeconds = optNum(input, "readyDelaySeconds");
  const stallTimeoutSeconds = optNum(input, "stallTimeoutSeconds");
  const noAutoMarkReady = optBool(input, "noAutoMarkReady");
  const noAutoCancelActionable = optBool(input, "noAutoCancelActionable");
  const result = await runIterate({
    ...FORMAT_TEXT,
    prNumber,
    cooldownSeconds,
    readyDelaySeconds,
    stallTimeoutSeconds,
    noAutoMarkReady,
    noAutoCancelActionable,
  });
  return ok(formatIterateResult(result));
}

export async function handleMonitor(input: Record<string, unknown>): Promise<CallToolResult> {
  const prNumber = optNum(input, "prNumber");
  const readyDelaySuffix = optStr(input, "readyDelaySuffix");
  const result = await runMonitor({ ...FORMAT_TEXT, prNumber, readyDelaySuffix });
  return ok(formatMonitorResult(result));
}

export async function handleStatus(input: Record<string, unknown>): Promise<CallToolResult> {
  const prNumbers = reqNumArray(input, "prNumbers");
  const repo = await getRepoInfo();
  const summaries = await runStatus({ ...FORMAT_TEXT, prNumbers });
  return ok(formatStatusTable(summaries, `${repo.owner}/${repo.name}`));
}

export async function handleLogFile(): Promise<CallToolResult> {
  const result = await runLogFile();
  return ok(result.path);
}

export function handleSubscribePr(
  input: Record<string, unknown>,
  subs: SubscriptionStore,
): CallToolResult {
  const prNumber = reqNum(input, "prNumber");
  subs.subscribe(prNumber);
  return ok(
    `Subscribed to PR #${prNumber}. Webhook events for this PR will be forwarded as MCP notifications.`,
  );
}

export function handleUnsubscribePr(
  input: Record<string, unknown>,
  subs: SubscriptionStore,
): CallToolResult {
  const prNumber = reqNum(input, "prNumber");
  subs.unsubscribe(prNumber);
  return ok(`Unsubscribed from PR #${prNumber}.`);
}
