/**
 * MCP tool registration for pr-shepherd.
 *
 * buildToolList()    — combines PR_TOOLS and OPS_TOOLS for ListTools responses.
 * buildToolHandler() — routes CallTool requests to the right handler.
 */

import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type { SubscriptionStore } from "./subscriptions.mts";
import { PR_TOOLS } from "./tool-list-pr.mts";
import { OPS_TOOLS } from "./tool-list-ops.mts";
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

export function buildToolList(): Tool[] {
  return [...PR_TOOLS, ...OPS_TOOLS];
}

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
