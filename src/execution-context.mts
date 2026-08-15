import { AsyncLocalStorage } from "node:async_hooks";

interface ExecutionContext {
  cwd?: string;
}

const executionContext = new AsyncLocalStorage<ExecutionContext>();

/**
 * Runs work with an optional working directory without changing Node's global
 * process state. This keeps independent API/MCP requests safe to run together.
 */
export function runWithExecutionCwd<T>(cwd: string | undefined, work: () => T): T {
  if (cwd === undefined) return work();
  return executionContext.run({ cwd }, work);
}

/** The caller-scoped working directory, when one was supplied. */
export function getExecutionCwd(): string | undefined {
  return executionContext.getStore()?.cwd;
}

/** The caller-scoped working directory, falling back to the CLI process cwd. */
export function getEffectiveCwd(): string {
  return getExecutionCwd() ?? process.cwd();
}
