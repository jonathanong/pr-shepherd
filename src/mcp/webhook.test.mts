import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { WebhookServer } from "./webhook.mts";
import type { WebhookPayload } from "./webhook.mts";

const PORT = 47823; // fixed test port unlikely to conflict

function sign(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

async function post(
  path: string,
  body: string,
  headers: Record<string, string> = {},
): Promise<{ status: number }> {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json", ...headers },
  });
  return { status: res.status };
}

describe("WebhookServer — port 0 (disabled)", () => {
  it("start() is a no-op and stop() does not throw", async () => {
    const server = new WebhookServer({ port: 0, onEvent: vi.fn() });
    await expect(server.start()).resolves.toBeUndefined();
    await expect(server.stop()).resolves.toBeUndefined();
  });
});

describe("WebhookServer — HTTP", () => {
  let server: WebhookServer;
  let events: WebhookPayload[];

  beforeEach(async () => {
    events = [];
    server = new WebhookServer({
      port: PORT,
      onEvent: (p) => events.push(p),
    });
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  it("rejects non-POST requests with 405", async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/webhook`);
    expect(res.status).toBe(405);
  });

  it("accepts a pull_request event and fires onEvent", async () => {
    const body = JSON.stringify({
      action: "synchronize",
      pull_request: { number: 42 },
      repository: { full_name: "owner/repo" },
      sender: { login: "alice" },
    });
    const { status } = await post("/webhook", body, {
      "x-github-event": "pull_request",
    });
    expect(status).toBe(204);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event: "pull_request",
      action: "synchronize",
      prNumber: 42,
      repoFullName: "owner/repo",
      actor: "alice",
    });
    expect(events[0]!.timestamp).toMatch(/^\d{4}-/);
  });

  it("extracts PR from body.number for issue events", async () => {
    const body = JSON.stringify({
      number: 7,
      repository: { full_name: "owner/repo" },
    });
    await post("/webhook", body, { "x-github-event": "issues" });
    expect(events[0]).toMatchObject({ prNumber: 7 });
  });

  it("extracts PR from check_run.pull_requests", async () => {
    const body = JSON.stringify({
      check_run: { pull_requests: [{ number: 99 }] },
      repository: { full_name: "owner/repo" },
    });
    await post("/webhook", body, { "x-github-event": "check_run" });
    expect(events[0]).toMatchObject({ prNumber: 99 });
  });

  it("extracts PR from workflow_run.pull_requests", async () => {
    const body = JSON.stringify({
      workflow_run: { pull_requests: [{ number: 55 }] },
      repository: { full_name: "owner/repo" },
    });
    await post("/webhook", body, { "x-github-event": "workflow_run" });
    expect(events[0]).toMatchObject({ prNumber: 55 });
  });

  it("silently drops events with no PR number", async () => {
    const body = JSON.stringify({ repository: { full_name: "owner/repo" } });
    const { status } = await post("/webhook", body, { "x-github-event": "ping" });
    expect(status).toBe(204);
    expect(events).toHaveLength(0);
  });

  it("includes ref and sha when present", async () => {
    const body = JSON.stringify({
      pull_request: { number: 1 },
      repository: { full_name: "owner/repo" },
      ref: "refs/heads/main",
      after: "abc123",
    });
    await post("/webhook", body, { "x-github-event": "push" });
    expect(events[0]).toMatchObject({ ref: "refs/heads/main", sha: "abc123" });
  });

  it("falls back to head_commit.id for sha", async () => {
    const body = JSON.stringify({
      pull_request: { number: 1 },
      repository: { full_name: "owner/repo" },
      head_commit: { id: "def456" },
    });
    await post("/webhook", body, { "x-github-event": "push" });
    expect(events[0]).toMatchObject({ sha: "def456" });
  });

  it("returns 400 for invalid JSON", async () => {
    const { status } = await post("/webhook", "not-json", { "x-github-event": "push" });
    expect(status).toBe(400);
  });
});

describe("WebhookServer — signature validation", () => {
  let server: WebhookServer;
  let events: WebhookPayload[];
  const SECRET = "test-secret";
  const SECRET_PORT = PORT + 1;

  beforeEach(async () => {
    events = [];
    server = new WebhookServer({
      port: SECRET_PORT,
      secret: SECRET,
      onEvent: (p) => events.push(p),
    });
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  async function postSigned(body: string, sigOverride?: string) {
    const sig = sigOverride ?? sign(body, SECRET);
    return fetch(`http://127.0.0.1:${SECRET_PORT}/webhook`, {
      method: "POST",
      body,
      headers: { "x-github-event": "pull_request", "x-hub-signature-256": sig },
    });
  }

  it("accepts request with valid signature", async () => {
    const body = JSON.stringify({
      pull_request: { number: 1 },
      repository: { full_name: "owner/repo" },
    });
    const res = await postSigned(body);
    expect(res.status).toBe(204);
    expect(events).toHaveLength(1);
  });

  it("rejects request with invalid signature", async () => {
    const body = JSON.stringify({ pull_request: { number: 1 } });
    const res = await postSigned(body, "sha256=deadbeef");
    expect(res.status).toBe(400);
    expect(events).toHaveLength(0);
  });

  it("rejects request with missing signature", async () => {
    const body = JSON.stringify({ pull_request: { number: 1 } });
    const res = await fetch(`http://127.0.0.1:${SECRET_PORT}/webhook`, {
      method: "POST",
      body,
    });
    expect(res.status).toBe(400);
  });
});
