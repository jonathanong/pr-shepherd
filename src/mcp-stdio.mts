#!/usr/bin/env node
import { runPrShepherdMcpStdio } from "./mcp/index.mts";

runPrShepherdMcpStdio().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`pr-shepherd-mcp error: ${message}\n`);
  process.exitCode = 1;
});
