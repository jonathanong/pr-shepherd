/**
 * MCP tool definitions for pr-shepherd.
 *
 * buildToolList()    — returns the Tool[] for ListTools responses.
 * buildToolHandler() — returns a dispatcher that routes CallTool requests to
 *                      the corresponding handler in tool-handlers.mts.
 */

import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type { SubscriptionStore } from "./subscriptions.mts";
import {
  handleCheck,
  handleResolveFetch,
  handleResolveMutate,
  handleCommitSuggestion,
  handleIterate,
  handleMonitor,
  handleStatus,
  handleLogFile,
  handleSubscribePr,
  handleUnsubscribePr,
  err,
} from "./tool-handlers.mts";

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
          prNumber: {
            type: "number",
            description: "PR number (auto-detected from current branch if omitted)",
          },
          skipTriage: {
            type: "boolean",
            description: "Skip fetching job info and log tails for failing checks",
          },
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
          prNumber: {
            type: "number",
            description: "PR number (auto-detected from current branch if omitted)",
          },
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
          prNumber: {
            type: "number",
            description: "PR number (auto-detected from current branch if omitted)",
          },
          resolveThreadIds: {
            type: "array",
            items: { type: "string" },
            description: "Thread node IDs to resolve",
          },
          minimizeCommentIds: {
            type: "array",
            items: { type: "string" },
            description: "Comment node IDs to minimize",
          },
          dismissReviewIds: {
            type: "array",
            items: { type: "string" },
            description: "Review node IDs to dismiss",
          },
          dismissMessage: { type: "string", description: "Required when dismissing reviews" },
          requireSha: {
            type: "string",
            description: "Wait for GitHub to receive this commit SHA before resolving",
          },
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
          prNumber: {
            type: "number",
            description: "PR number (auto-detected from current branch if omitted)",
          },
          threadId: {
            type: "string",
            description: "Review thread node ID containing the suggestion",
          },
          message: {
            type: "string",
            description: "Commit message (required unless dryRun is true)",
          },
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
          prNumber: {
            type: "number",
            description: "PR number (auto-detected from current branch if omitted)",
          },
          cooldownSeconds: { type: "number", description: "Minimum seconds between code changes" },
          readyDelaySeconds: {
            type: "number",
            description: "Seconds to wait after all checks pass before marking ready",
          },
          stallTimeoutSeconds: {
            type: "number",
            description: "Abort if no progress after this many seconds",
          },
          noAutoMarkReady: {
            type: "boolean",
            description: "Disable automatic draft → ready transition",
          },
          noAutoCancelActionable: {
            type: "boolean",
            description: "Disable automatic cancellation of actionable checks",
          },
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
          prNumber: {
            type: "number",
            description: "PR number (auto-detected from current branch if omitted)",
          },
          readyDelaySuffix: {
            type: "string",
            description: "Ready-delay duration string, e.g. '15m'",
          },
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
