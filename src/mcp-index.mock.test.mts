import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockStartMcpServer } = vi.hoisted(() => ({
  mockStartMcpServer: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./mcp/server.mts", () => ({ startMcpServer: mockStartMcpServer }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let exitSpy: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stderrSpy: any;

beforeEach(() => {
  vi.resetModules();
  mockStartMcpServer.mockReset();
  mockStartMcpServer.mockResolvedValue(undefined);
  exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as () => never);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  delete process.env["SHEPHERD_WEBHOOK_PORT"];
  delete process.env["GITHUB_WEBHOOK_SECRET"];
});

afterEach(() => {
  exitSpy.mockRestore();
  stderrSpy.mockRestore();
});

async function loadIndex() {
  await import("./mcp-index.mts");
  await Promise.resolve();
}

describe("mcp-index — startMcpServer invocation", () => {
  it("calls startMcpServer with default port 3000 when env not set", async () => {
    await loadIndex();
    expect(mockStartMcpServer).toHaveBeenCalledWith({
      webhookPort: 3000,
      webhookSecret: undefined,
    });
  });

  it("passes parsed SHEPHERD_WEBHOOK_PORT to startMcpServer", async () => {
    process.env["SHEPHERD_WEBHOOK_PORT"] = "4567";
    await loadIndex();
    expect(mockStartMcpServer).toHaveBeenCalledWith(expect.objectContaining({ webhookPort: 4567 }));
  });

  it("disables webhook when SHEPHERD_WEBHOOK_PORT=0", async () => {
    process.env["SHEPHERD_WEBHOOK_PORT"] = "0";
    await loadIndex();
    expect(mockStartMcpServer).toHaveBeenCalledWith(expect.objectContaining({ webhookPort: 0 }));
  });

  it("falls back to 3000 for non-numeric SHEPHERD_WEBHOOK_PORT", async () => {
    process.env["SHEPHERD_WEBHOOK_PORT"] = "notanumber";
    await loadIndex();
    expect(mockStartMcpServer).toHaveBeenCalledWith(expect.objectContaining({ webhookPort: 3000 }));
  });

  it("falls back to 3000 for negative SHEPHERD_WEBHOOK_PORT", async () => {
    process.env["SHEPHERD_WEBHOOK_PORT"] = "-1";
    await loadIndex();
    expect(mockStartMcpServer).toHaveBeenCalledWith(expect.objectContaining({ webhookPort: 3000 }));
  });

  it("passes GITHUB_WEBHOOK_SECRET to startMcpServer", async () => {
    process.env["GITHUB_WEBHOOK_SECRET"] = "mysecret";
    await loadIndex();
    expect(mockStartMcpServer).toHaveBeenCalledWith(
      expect.objectContaining({ webhookSecret: "mysecret" }),
    );
  });
});

describe("mcp-index — error handling", () => {
  it("writes error message to stderr and exits 1 when startMcpServer rejects with Error", async () => {
    mockStartMcpServer.mockRejectedValueOnce(new Error("connection refused"));
    await loadIndex();
    expect(stderrSpy).toHaveBeenCalledWith("pr-shepherd-mcp error: connection refused\n");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("stringifies non-Error rejections", async () => {
    mockStartMcpServer.mockRejectedValueOnce("fatal");
    await loadIndex();
    expect(stderrSpy).toHaveBeenCalledWith("pr-shepherd-mcp error: fatal\n");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
