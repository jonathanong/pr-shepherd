/**
 * HTTP server for receiving GitHub webhook events.
 *
 * Uses Node.js built-in http + crypto — no extra dependencies.
 * Validates X-Hub-Signature-256 when GITHUB_WEBHOOK_SECRET is set.
 * Extracts the PR number from the webhook payload and fires onEvent.
 */

import { createServer, type Server as HttpServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";

export interface WebhookPayload {
  event: string;
  action?: string;
  prNumber: number;
  repoFullName: string;
  ref?: string;
  sha?: string;
  actor?: string;
  timestamp: string;
}

export interface WebhookServerOptions {
  port: number;
  secret?: string;
  onEvent: (payload: WebhookPayload) => void;
}

export class WebhookServer {
  private readonly opts: WebhookServerOptions;
  private server: HttpServer | null = null;

  constructor(opts: WebhookServerOptions) {
    this.opts = opts;
  }

  async start(): Promise<void> {
    if (this.opts.port === 0) return;

    this.server = createServer((req, res) => {
      if (req.method !== "POST") {
        res.writeHead(405).end("Method Not Allowed");
        return;
      }

      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const body = Buffer.concat(chunks);

        if (this.opts.secret) {
          const sig = req.headers["x-hub-signature-256"];
          if (typeof sig !== "string" || !verifySignature(body, sig, this.opts.secret)) {
            res.writeHead(400).end("Invalid signature");
            return;
          }
        }

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(body.toString("utf8")) as Record<string, unknown>;
        } catch {
          res.writeHead(400).end("Invalid JSON");
          return;
        }

        const event = req.headers["x-github-event"];
        const eventStr = typeof event === "string" ? event : "unknown";
        const prNumber = extractPrNumber(eventStr, parsed);

        if (prNumber !== null && prNumber > 0) {
          const payload = buildPayload(eventStr, parsed, prNumber);
          this.opts.onEvent(payload);
        }

        res.writeHead(204).end();
      });
      req.on("error", () => res.writeHead(400).end("Request error"));
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.listen(this.opts.port, () => resolve());
      this.server!.once("error", reject);
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = null;
  }
}

function verifySignature(body: Buffer, signature: string, secret: string): boolean {
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function extractPrNumber(event: string, body: Record<string, unknown>): number | null {
  const pr = body["pull_request"];
  if (pr && typeof pr === "object" && "number" in pr) {
    const n = (pr as { number: unknown }).number;
    if (typeof n === "number") return n;
  }

  if (typeof body["number"] === "number") return body["number"];

  if (event === "check_run") {
    const prs = (body["check_run"] as { pull_requests?: Array<{ number: number }> } | undefined)
      ?.pull_requests;
    if (prs?.[0]) return prs[0].number;
  }

  if (event === "workflow_run") {
    const prs = (body["workflow_run"] as { pull_requests?: Array<{ number: number }> } | undefined)
      ?.pull_requests;
    if (prs?.[0]) return prs[0].number;
  }

  return null;
}

function buildPayload(
  event: string,
  body: Record<string, unknown>,
  prNumber: number,
): WebhookPayload {
  const repo = body["repository"] as { full_name?: string } | undefined;
  const sender = body["sender"] as { login?: string } | undefined;
  const headCommit = body["head_commit"] as { id?: string } | undefined;

  const payload: WebhookPayload = {
    event,
    prNumber,
    repoFullName: repo?.full_name ?? "unknown/unknown",
    timestamp: new Date().toISOString(),
  };

  const action = body["action"];
  if (typeof action === "string") payload.action = action;

  const ref = body["ref"];
  if (typeof ref === "string") payload.ref = ref;

  const sha = body["after"] ?? headCommit?.id;
  if (typeof sha === "string") payload.sha = sha;

  if (sender?.login) payload.actor = sender.login;

  return payload;
}
