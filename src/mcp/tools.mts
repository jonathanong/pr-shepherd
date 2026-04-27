/**
 * MCP tool definitions for pr-shepherd.
 *
 * Each tool delegates to the corresponding run*() command function and returns
 * formatted text output (same as CLI --format=text) as MCP TextContent.
 */

import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";

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

// ---------------------------------------------------------------------------
// Common types
// ---------------------------------------------------------------------------

const TEXT: "text" = "text";
const FORMAT_TEXT = { format: TEXT } as const;

export interface ToolDependencies {
  subscriptions: SubscriptionStore;
}

// ---------------------------------------------------------------------------
// Tool list
// ---------------------------------------------------------------------------

export function buildToolList(): Tool[] {
  return [
    {
      name: "shepherd_check",
      description:
        "Get a PR status snapshot: CI checks (passing/failing/in-progress), review threads, PR comments, and merge status. Read-only.",
      inputSchema: {
        type: "object",
        properties: {
          prNumber: { type: "number", description: "PR number (auto-detected from current branch if omitted)" },
          skipTriage: { type: "boolean", description: "Skip fetching job info and log tails for failing checks" },
        },
      },
    },
    {
      name: "shepherd_resolve_fetch",
      description:
        "Fetch actionable review threads and PR comments for a PR. Auto-resolves outdated threads and surfaces first-look items. Returns structured triage output with instructions.",
      inputSchema: {
        type: "object",
        properties: {
          prNumber: { type: "number", description: "PR number (auto-detected from current branch if omitted)" },
        },
      },
    },
    {
      name: "shepherd_resolve_mutate",
      description:
        "Resolve, minimize, or dismiss review items by ID. Provide at least one of resolveThreadIds, minimizeCommentIds, or dismissReviewIds.",
      inputSchema: {
        type: "object",
        properties: {
          prNumber: { type: "number", description: "PR number (auto-detected from current branch if omitted)" },
          resolveThreadIds: { type: "array", items: { type: "string" }, description: "Thread node IDs to resolve" },
          minimizeCommentIds: { type: "array", items: { type: "string" }, description: "Comment node IDs to minimize" },
          dismissReviewIds: { type: "array", items: { type: "string" }, description: "Review node IDs to dismiss" },
          dismissMessage: { type: "string", description: "Required when dismissing reviews" },
          requireSha: { type: "string", description: "Wait for GitHub to receive this commit SHA before resolving" },
        },
      },
    },
    {
      name: "shepherd_commit_suggestion",
      description:
        "Apply a suggestion block from a review thread and create a local git commit. Optionally dry-run to validate without committing.",
      inputSchema: {
        type: "object",
        required: ["threadId"],
        properties: {
          prNumber: { type: "number", description: "PR number (auto-detected from current branch if omitted)" },
          threadId: { type: "string", description: "Review thread node ID containing the suggestion" },
          message: { type: "string", description: "Commit message (required unless dryRun is true)" },
          description: { type: "string", description: "Optional extended commit description" },
          dryRun: { type: "boolean", description: "Validate the patch without applying it" },
        },
      },
    },
    {
      name: "shepherd_iterate",
      description:
        "Run one iterate cycle: assess PR state and return the next action (fix_code, wait, mark_ready, cancel, or escalate) with instructions.",
      inputSchema: {
        type: "object",
        properties: {
          prNumber: { type: "number", description: "PR number (auto-detected from current branch if omitted)" },
          cooldownSeconds: { type: "number", description: "Minimum seconds between code changes" },
          readyDelaySeconds: { type: "number", description: "Seconds to wait after all checks pass before marking ready" },
          stallTimeoutSeconds: { type: "number", description: "Abort if no progress after this many seconds" },
          noAutoMarkReady: { type: "boolean", description: "Disable automatic draft → ready transition" },
          noAutoCancelActionable: { type: "boolean", description: "Disable automatic cancellation of actionable checks" },
        },
      },
    },
    {
      name: "shepherd_monitor",
      description:
        "Get the /loop arguments and prompt body to start continuous PR monitoring. Use this to bootstrap the monitoring loop.",
      inputSchema: {
        type: "object",
        properties: {
          prNumber: { type: "number", description: "PR number (auto-detected from current branch if omitted)" },
          readyDelaySuffix: { type: "string", description: "Ready-delay duration string, e.g. '15m'" },
        },
      },
    },
    {
      name: "shepherd_status",
      description: "Get a status table for one or more PRs in a single GitHub request.",
      inputSchema: {
        type: "object",
        required: ["prNumbers"],
        properties: {
          prNumbers: {
            type: "array",
            items: { type: "number" },
            minItems: 1,
            description: "List of PR numbers to check",
          },
        },
      },
    },
    {
      name: "shepherd_log_file",
      description: "Return the path to the per-worktree debug log file.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "shepherd_subscribe_pr",
      description:
        "Subscribe this session to GitHub webhook events for the given PR number. Matching events will be forwarded as MCP notifications wrapped in <github-webhook-activity> tags.",
      inputSchema: {
        type: "object",
        required: ["prNumber"],
        properties: {
          prNumber: { type: "number", description: "PR number to subscribe to" },
        },
      },
    },
    {
      name: "shepherd_unsubscribe_pr",
      description: "Unsubscribe this session from GitHub webhook events for the given PR number.",
      inputSchema: {
        type: "object",
        required: ["prNumber"],
        properties: {
          prNumber: { type: "number", description: "PR number to unsubscribe from" },
        },
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Tool handler dispatcher
// ---------------------------------------------------------------------------

export function buildToolHandler(
  deps: ToolDependencies,
): (name: string, input: Record<string, unknown>) => Promise<CallToolResult> {
  return async (name, input) => {
    try {
      switch (name) {
        case "shepherd_check":
          return await handleCheck(input);
        case "shepherd_resolve_fetch":
          return await handleResolveFetch(input);
        case "shepherd_resolve_mutate":
          return await handleResolveMutate(input);
        case "shepherd_commit_suggestion":
          return await handleCommitSuggestion(input);
        case "shepherd_iterate":
          return await handleIterate(input);
        case "shepherd_monitor":
          return await handleMonitor(input);
        case "shepherd_status":
          return await handleStatus(input);
        case "shepherd_log_file":
          return await handleLogFile();
        case "shepherd_subscribe_pr":
          return handleSubscribePr(input, deps.subscriptions);
        case "shepherd_unsubscribe_pr":
          return handleUnsubscribePr(input, deps.subscriptions);
        default:
          return err(`Unknown tool: ${name}`);
      }
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  };
}

// ---------------------------------------------------------------------------
// Individual handlers
// ---------------------------------------------------------------------------

async function handleCheck(input: Record<string, unknown>): Promise<CallToolResult> {
  const prNumber = optNum(input, "prNumber");
  const skipTriage = optBool(input, "skipTriage");
  const report = await runCheck({ ...FORMAT_TEXT, prNumber, skipTriage });
  return ok(formatText(report));
}

async function handleResolveFetch(input: Record<string, unknown>): Promise<CallToolResult> {
  const prNumber = optNum(input, "prNumber");
  const result = await runResolveFetch({ ...FORMAT_TEXT, prNumber });
  return ok(formatFetchResult(result));
}

async function handleResolveMutate(input: Record<string, unknown>): Promise<CallToolResult> {
  const prNumber = optNum(input, "prNumber");
  const resolveThreadIds = optStringArray(input, "resolveThreadIds");
  const minimizeCommentIds = optStringArray(input, "minimizeCommentIds");
  const dismissReviewIds = optStringArray(input, "dismissReviewIds");
  const dismissMessage = optStr(input, "dismissMessage");
  const requireSha = optStr(input, "requireSha");

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

async function handleCommitSuggestion(input: Record<string, unknown>): Promise<CallToolResult> {
  const prNumber = optNum(input, "prNumber");
  const threadId = reqStr(input, "threadId");
  const message = optStr(input, "message");
  const description = optStr(input, "description");
  const dryRun = optBool(input, "dryRun");
  const result = await runCommitSuggestion({ ...FORMAT_TEXT, prNumber, threadId, message, description, dryRun });
  return ok(formatCommitSuggestionResult(result));
}

async function handleIterate(input: Record<string, unknown>): Promise<CallToolResult> {
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

async function handleMonitor(input: Record<string, unknown>): Promise<CallToolResult> {
  const prNumber = optNum(input, "prNumber");
  const readyDelaySuffix = optStr(input, "readyDelaySuffix");
  const result = await runMonitor({ ...FORMAT_TEXT, prNumber, readyDelaySuffix });
  return ok(formatMonitorResult(result));
}

async function handleStatus(input: Record<string, unknown>): Promise<CallToolResult> {
  const prNumbers = reqNumArray(input, "prNumbers");
  const repo = await getRepoInfo();
  const summaries = await runStatus({ ...FORMAT_TEXT, prNumbers });
  return ok(formatStatusTable(summaries, `${repo.owner}/${repo.name}`));
}

async function handleLogFile(): Promise<CallToolResult> {
  const result = await runLogFile();
  return ok(result.path);
}

function handleSubscribePr(
  input: Record<string, unknown>,
  subs: SubscriptionStore,
): CallToolResult {
  const prNumber = reqNum(input, "prNumber");
  subs.subscribe(prNumber);
  const all = subs.listSubscribed();
  return ok(
    `Subscribed to PR #${prNumber}. Webhook events for this PR will be forwarded as MCP notifications.\nCurrently subscribed PRs: ${all.join(", ")}`,
  );
}

function handleUnsubscribePr(
  input: Record<string, unknown>,
  subs: SubscriptionStore,
): CallToolResult {
  const prNumber = reqNum(input, "prNumber");
  subs.unsubscribe(prNumber);
  const all = subs.listSubscribed();
  const remaining = all.length > 0 ? all.join(", ") : "(none)";
  return ok(`Unsubscribed from PR #${prNumber}.\nCurrently subscribed PRs: ${remaining}`);
}

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

function ok(text: string): CallToolResult {
  return { content: [{ type: TEXT, text }] };
}

function err(msg: string): CallToolResult {
  return { content: [{ type: TEXT, text: `Error: ${msg}` }], isError: true };
}

// ---------------------------------------------------------------------------
// Input coercion helpers
// ---------------------------------------------------------------------------

function optNum(input: Record<string, unknown>, key: string): number | undefined {
  const v = input[key];
  return typeof v === "number" ? v : undefined;
}

function reqNum(input: Record<string, unknown>, key: string): number {
  const v = input[key];
  if (typeof v !== "number") throw new Error(`${key} is required and must be a number`);
  return v;
}

function optStr(input: Record<string, unknown>, key: string): string | undefined {
  const v = input[key];
  return typeof v === "string" ? v : undefined;
}

function reqStr(input: Record<string, unknown>, key: string): string {
  const v = input[key];
  if (typeof v !== "string" || v === "") throw new Error(`${key} is required and must be a non-empty string`);
  return v;
}

function optBool(input: Record<string, unknown>, key: string): boolean | undefined {
  const v = input[key];
  return typeof v === "boolean" ? v : undefined;
}

function optStringArray(input: Record<string, unknown>, key: string): string[] | undefined {
  const v = input[key];
  if (!Array.isArray(v)) return undefined;
  return v.filter((x): x is string => typeof x === "string");
}

function reqNumArray(input: Record<string, unknown>, key: string): number[] {
  const v = input[key];
  if (!Array.isArray(v) || v.length === 0) throw new Error(`${key} must be a non-empty array of numbers`);
  return v.filter((x): x is number => typeof x === "number");
}
