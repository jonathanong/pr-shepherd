import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — vi.mock factories are hoisted, so referenced vars must be too
// ---------------------------------------------------------------------------

const {
  mockConnect,
  mockSetRequestHandler,
  mockSendLoggingMessage,
  MockServer,
  MockStdioTransport,
  mockWebhookStart,
  MockWebhookServer,
  getCapturedOnEvent,
} = vi.hoisted(() => {
  const mockConnect = vi.fn().mockResolvedValue(undefined);
  const mockSetRequestHandler = vi.fn();
  const mockSendLoggingMessage = vi.fn().mockResolvedValue(undefined);
  const MockServer = vi.fn().mockImplementation(function () {
    return {
      connect: mockConnect,
      setRequestHandler: mockSetRequestHandler,
      sendLoggingMessage: mockSendLoggingMessage,
    };
  });
  const MockStdioTransport = vi.fn().mockImplementation(function () {
    return {};
  });

  const mockWebhookStart = vi.fn().mockResolvedValue(undefined);
  const mockWebhookStop = vi.fn().mockResolvedValue(undefined);
  let capturedOnEvent: ((payload: unknown) => void) | undefined;
  const MockWebhookServer = vi.fn().mockImplementation(function (opts: {
    onEvent: (p: unknown) => void;
  }) {
    capturedOnEvent = opts.onEvent;
    return {
      start: mockWebhookStart,
      stop: mockWebhookStop,
      isRunning: vi.fn().mockReturnValue(true),
    };
  });

  return {
    mockConnect,
    mockSetRequestHandler,
    mockSendLoggingMessage,
    MockServer,
    MockStdioTransport,
    mockWebhookStart,
    MockWebhookServer,
    getCapturedOnEvent: () => capturedOnEvent,
  };
});

vi.mock("@modelcontextprotocol/sdk/server/index.js", () => ({ Server: MockServer }));
vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: MockStdioTransport,
}));
vi.mock("@modelcontextprotocol/sdk/types.js", () => ({
  ListToolsRequestSchema: "LIST_TOOLS",
  CallToolRequestSchema: "CALL_TOOL",
}));
vi.mock("./subscriptions.mts", () => ({
  SubscriptionStore: vi.fn().mockImplementation(function () {
    return { isSubscribed: vi.fn().mockReturnValue(false) };
  }),
}));
vi.mock("./webhook.mts", () => ({ WebhookServer: MockWebhookServer }));
vi.mock("./tools.mts", () => ({
  buildToolList: vi.fn().mockReturnValue([]),
  buildToolHandler: vi.fn().mockReturnValue(vi.fn()),
}));
vi.mock("node:fs", () => ({
  readFileSync: vi.fn().mockReturnValue('{"version":"0.0.0-test"}'),
}));

import { startMcpServer } from "./server.mts";

beforeEach(() => {
  vi.clearAllMocks();
  mockConnect.mockResolvedValue(undefined);
  mockSendLoggingMessage.mockResolvedValue(undefined);
  mockWebhookStart.mockResolvedValue(undefined);
});

let stderrSpy: ReturnType<typeof vi.spyOn>;
let processSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  processSpy = vi.spyOn(process, "on").mockImplementation(() => process);
});

afterEach(() => {
  stderrSpy.mockRestore();
  processSpy.mockRestore();
});

describe("startMcpServer — basic wiring", () => {
  it("creates MCP Server with pr-shepherd name and version", async () => {
    await startMcpServer({ webhookPort: 0 });
    expect(MockServer).toHaveBeenCalledWith(
      { name: "pr-shepherd", version: "0.0.0-test" },
      expect.objectContaining({ capabilities: expect.any(Object) }),
    );
  });

  it("registers ListTools and CallTool handlers", async () => {
    await startMcpServer({ webhookPort: 0 });
    expect(mockSetRequestHandler).toHaveBeenCalledWith("LIST_TOOLS", expect.any(Function));
    expect(mockSetRequestHandler).toHaveBeenCalledWith("CALL_TOOL", expect.any(Function));
  });

  it("connects stdio transport", async () => {
    await startMcpServer({ webhookPort: 0 });
    expect(MockStdioTransport).toHaveBeenCalled();
    expect(mockConnect).toHaveBeenCalledWith(expect.any(Object));
  });
});

describe("startMcpServer — webhook disabled (port 0)", () => {
  it("does not create WebhookServer", async () => {
    await startMcpServer({ webhookPort: 0 });
    expect(MockWebhookServer).not.toHaveBeenCalled();
  });
});

describe("startMcpServer — webhook enabled", () => {
  it("starts WebhookServer on the given port", async () => {
    await startMcpServer({ webhookPort: 3000 });
    expect(MockWebhookServer).toHaveBeenCalledWith(expect.objectContaining({ port: 3000 }));
    expect(mockWebhookStart).toHaveBeenCalled();
  });

  it("logs the webhook port to stderr", async () => {
    await startMcpServer({ webhookPort: 3000 });
    expect(stderrSpy).toHaveBeenCalledWith(
      "pr-shepherd-mcp: webhook server listening on port 3000\n",
    );
  });

  it("passes the webhook secret to WebhookServer", async () => {
    await startMcpServer({ webhookPort: 3000, webhookSecret: "s3cr3t" });
    expect(MockWebhookServer).toHaveBeenCalledWith(expect.objectContaining({ secret: "s3cr3t" }));
  });

  it("registers SIGTERM and SIGINT handlers", async () => {
    await startMcpServer({ webhookPort: 3000 });
    expect(processSpy).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
    expect(processSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));
  });
});

describe("webhook onEvent — notification forwarding", () => {
  it("sends MCP logging message when PR is subscribed", async () => {
    const { SubscriptionStore } = await import("./subscriptions.mts");
    vi.mocked(SubscriptionStore).mockImplementationOnce(function () {
      return { isSubscribed: vi.fn().mockReturnValue(true) };
    } as never);
    await startMcpServer({ webhookPort: 3000 });
    getCapturedOnEvent()!({
      event: "pull_request",
      action: "synchronize",
      prNumber: 42,
      repoFullName: "owner/repo",
      timestamp: "2026-01-01T00:00:00Z",
    });
    await Promise.resolve();
    expect(mockSendLoggingMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "info",
        data: expect.stringContaining("<github-webhook-activity>"),
      }),
    );
    const data: string = mockSendLoggingMessage.mock.calls[0][0].data;
    expect(data).toContain("event: pull_request");
    expect(data).toContain("action: synchronize");
    expect(data).toContain("pr: 42");
    expect(data).toContain("repo: owner/repo");
  });

  it("skips notification when PR is not subscribed", async () => {
    await startMcpServer({ webhookPort: 3000 });
    getCapturedOnEvent()!({ event: "push", prNumber: 99, repoFullName: "x/y", timestamp: "t" });
    await Promise.resolve();
    expect(mockSendLoggingMessage).not.toHaveBeenCalled();
  });

  it("logs error when sendLoggingMessage rejects", async () => {
    const { SubscriptionStore } = await import("./subscriptions.mts");
    vi.mocked(SubscriptionStore).mockImplementationOnce(function () {
      return { isSubscribed: vi.fn().mockReturnValue(true) };
    } as never);
    mockSendLoggingMessage.mockRejectedValueOnce(new Error("send failed"));
    await startMcpServer({ webhookPort: 3000 });
    getCapturedOnEvent()!({ event: "push", prNumber: 1, repoFullName: "x/y", timestamp: "t" });
    await new Promise((r) => setTimeout(r, 10));
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("failed to send webhook notification"),
    );
  });

  it("includes optional fields in notification when present", async () => {
    const { SubscriptionStore } = await import("./subscriptions.mts");
    vi.mocked(SubscriptionStore).mockImplementationOnce(function () {
      return { isSubscribed: vi.fn().mockReturnValue(true) };
    } as never);
    await startMcpServer({ webhookPort: 3000 });
    getCapturedOnEvent()!({
      event: "push",
      prNumber: 1,
      repoFullName: "x/y",
      ref: "refs/heads/main",
      sha: "abc123",
      actor: "bob",
      timestamp: "2026-01-01T00:00:00Z",
    });
    await Promise.resolve();
    const data: string = mockSendLoggingMessage.mock.calls[0][0].data;
    expect(data).toContain("ref: refs/heads/main");
    expect(data).toContain("sha: abc123");
    expect(data).toContain("actor: bob");
  });
});
