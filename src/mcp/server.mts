/**
 * MCP server for pr-shepherd.
 *
 * Exposes all pr-shepherd CLI commands as MCP tools and optionally starts an
 * HTTP webhook server. When a webhook arrives for a subscribed PR, it is
 * forwarded to the connected Claude Code session as an MCP logging notification
 * wrapped in <github-webhook-activity> tags.
 */

import { readFileSync } from "node:fs";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { SubscriptionStore } from "./subscriptions.mts";
import { WebhookServer } from "./webhook.mts";
import type { WebhookPayload } from "./webhook.mts";
import { buildToolList, buildToolHandler } from "./tools.mts";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface McpServerOptions {
  /** HTTP port for the GitHub webhook endpoint. 0 = disabled. */
  webhookPort: number;
  /** HMAC secret for X-Hub-Signature-256 validation. Optional. */
  webhookSecret?: string;
}

export async function startMcpServer(opts: McpServerOptions): Promise<void> {
  const version = readVersion();

  const server = new Server(
    { name: "pr-shepherd", version },
    { capabilities: { tools: {}, logging: {} } },
  );

  const subscriptions = new SubscriptionStore();
  const handleTool = buildToolHandler({ subscriptions });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: buildToolList(),
  }));

  server.setRequestHandler(CallToolRequestSchema, (request) => {
    const name = request.params.name;
    const input = (request.params.arguments ?? {}) as Record<string, unknown>;
    // CallToolResult is a valid ServerResult member; cast needed due to SDK union complexity
    return handleTool(name, input) as Promise<Record<string, unknown>>;
  });

  // Start HTTP webhook server if enabled.
  if (opts.webhookPort !== 0) {
    if (!opts.webhookSecret) {
      process.stderr.write(
        `pr-shepherd-mcp: WARNING — GITHUB_WEBHOOK_SECRET is not set; webhook auth is disabled\n`,
      );
    }

    const webhookServer = new WebhookServer({
      port: opts.webhookPort,
      secret: opts.webhookSecret,
      onEvent: (payload) => {
        if (!subscriptions.isSubscribed(payload.prNumber)) return;
        server
          .sendLoggingMessage({ level: "info", data: formatWebhookNotification(payload) })
          .catch((e: unknown) => {
            process.stderr.write(
              `pr-shepherd-mcp: failed to send webhook notification: ${String(e)}\n`,
            );
          });
      },
    });

    await webhookServer.start();
    // start() swallows bind errors and sets server=null, so only log if it actually bound.
    if (webhookServer.isRunning()) {
      process.stderr.write(
        `pr-shepherd-mcp: webhook server listening on port ${opts.webhookPort}\n`,
      );
    }

    const shutdown = (signal: string) => {
      void (async () => {
        process.stderr.write(`pr-shepherd-mcp: received ${signal}, shutting down\n`);
        await webhookServer.stop();
        process.exit(0);
      })();
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatWebhookNotification(payload: WebhookPayload): string {
  const lines: string[] = ["<github-webhook-activity>", `event: ${payload.event}`];
  if (payload.action !== undefined) lines.push(`action: ${payload.action}`);
  lines.push(`pr: ${payload.prNumber}`);
  if (payload.repoFullName !== undefined) lines.push(`repo: ${payload.repoFullName}`);
  if (payload.ref !== undefined) lines.push(`ref: ${payload.ref}`);
  if (payload.sha !== undefined) lines.push(`sha: ${payload.sha}`);
  if (payload.actor !== undefined) lines.push(`actor: ${payload.actor}`);
  lines.push(`timestamp: ${payload.timestamp}`);
  lines.push("</github-webhook-activity>");
  return lines.join("\n");
}

function readVersion(): string {
  const pkgUrl = new URL("../../package.json", import.meta.url);
  const pkg = JSON.parse(readFileSync(pkgUrl, "utf8")) as { version: string };
  return pkg.version;
}
