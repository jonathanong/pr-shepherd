/** MCP tool definitions for PR inspection and mutation commands. */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export const PR_TOOLS: Tool[] = [
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
];
