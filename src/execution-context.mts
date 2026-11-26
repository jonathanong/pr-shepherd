import { AsyncLocalStorage } from "node:async_hooks";

interface ExecutionContext {
  cwd?: string;
  /** Set by the library `status` method: no GitHub mutation and no local state write. */
  readOnly?: boolean;
}

const executionContext = new AsyncLocalStorage<ExecutionContext>();

/**
 * Runs work with an optional working directory without changing Node's global
 * process state. This keeps independent API/MCP requests safe to run together.
 */
export function runWithExecutionCwd<T>(cwd: string | undefined, work: () => T): T {
  if (cwd === undefined) return work();
  // Keep any enclosing scope's other fields (read-only) when only the cwd changes.
  return executionContext.run({ ...executionContext.getStore(), cwd }, work);
}

/**
 * Runs work in a read-only scope: state writes, deletes and directory creation become no-ops,
 * and the HTTP layer refuses GitHub mutations. Composes with `runWithExecutionCwd` in either order.
 */
export function runReadOnly<T>(work: () => T): T {
  return executionContext.run({ ...executionContext.getStore(), readOnly: true }, work);
}

/** True inside `runReadOnly`. */
export function isReadOnly(): boolean {
  return executionContext.getStore()?.readOnly === true;
}

/** The caller-scoped working directory, when one was supplied. */
export function getExecutionCwd(): string | undefined {
  return executionContext.getStore()?.cwd;
}

/** The caller-scoped working directory, falling back to the CLI process cwd. */
export function getEffectiveCwd(): string {
  return getExecutionCwd() ?? process.cwd();
}
