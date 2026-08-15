import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createPrShepherdMcpServer, type CreatePrShepherdMcpServerOptions } from "./server.mts";

export { createPrShepherdMcpServer } from "./server.mts";
export type { CreatePrShepherdMcpServerOptions } from "./server.mts";

/** Starts the local stdio-only MCP transport. */
export async function runPrShepherdMcpStdio(
  options: CreatePrShepherdMcpServerOptions = {},
): Promise<void> {
  const server = createPrShepherdMcpServer(options);
  await server.connect(new StdioServerTransport());
}
