/** MCP tool definitions for monitoring, status, and subscription operations. */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export const OPS_TOOLS: Tool[] = [
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
