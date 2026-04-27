#!/usr/bin/env node
/**
 * pr-shepherd-mcp — MCP server entry point.
 *
 * Exposes all pr-shepherd CLI commands as MCP tools and optionally runs an
 * HTTP webhook server to forward GitHub PR events to the connected Claude Code
 * session as <github-webhook-activity> MCP notifications.
 *
 * Environment variables:
 *   SHEPHERD_WEBHOOK_PORT   HTTP port for the webhook endpoint (default: 3000, 0 = disabled)
 *   GITHUB_WEBHOOK_SECRET   HMAC secret for X-Hub-Signature-256 validation (optional)
 *   GH_TOKEN / GITHUB_TOKEN GitHub API token (required for all tool calls)
 */

import { startMcpServer } from "./mcp/server.mts";

const webhookPort = parsePort(process.env["SHEPHERD_WEBHOOK_PORT"]);
const webhookSecret = process.env["GITHUB_WEBHOOK_SECRET"] ?? undefined;

startMcpServer({ webhookPort, webhookSecret }).catch((err: unknown) => {
  process.stderr.write(
    `pr-shepherd-mcp error: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});

function parsePort(raw: string | undefined): number {
  if (raw === undefined) return 3000;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 3000;
}
