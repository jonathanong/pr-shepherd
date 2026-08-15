import { describe, expect, it, vi } from "vitest";

const { connect, createServer, transports } = vi.hoisted(() => ({
  connect: vi.fn(),
  createServer: vi.fn(),
  transports: [] as unknown[],
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: class StdioServerTransport {
    constructor() {
      transports.push(this);
    }
  },
}));
vi.mock("./server.mts", () => ({
  createPrShepherdMcpServer: createServer.mockReturnValue({ connect }),
}));

import { runPrShepherdMcpStdio } from "./index.mts";

describe("MCP stdio transport", () => {
  it("connects the configured server to a local stdio transport", async () => {
    const options = { cwd: "/tmp/project" };

    await runPrShepherdMcpStdio(options);

    expect(createServer).toHaveBeenCalledWith(options);
    expect(transports).toHaveLength(1);
    expect(connect).toHaveBeenCalledWith(transports[0]);
  });
});
