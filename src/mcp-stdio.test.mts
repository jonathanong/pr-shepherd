import { afterEach, describe, expect, it, vi } from "vitest";

const { runStdio } = vi.hoisted(() => ({ runStdio: vi.fn() }));

vi.mock("./mcp/index.mts", () => ({ runPrShepherdMcpStdio: runStdio }));

describe("MCP stdio executable", () => {
  afterEach(() => {
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  it("prints a safe startup error and sets a failing exit code", async () => {
    runStdio.mockRejectedValue(new Error("transport failed"));
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await import("./mcp-stdio.mts");
    await vi.waitFor(() => expect(process.exitCode).toBe(1));

    expect(stderr).toHaveBeenCalledWith("pr-shepherd-mcp error: transport failed\n");
  });
});
