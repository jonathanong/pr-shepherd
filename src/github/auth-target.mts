import { AsyncLocalStorage } from "node:async_hooks";

export interface AuthTarget {
  owner: string;
  repo: string;
}

/**
 * Per-command record of the repository GitHub requests act on. A request's own target (REST
 * path or GraphQL variables) wins; this scope covers requests that carry none (node-ID
 * mutations, `/user`, `/rate_limit`). It is AsyncLocalStorage, not process-global, because the
 * MCP server runs concurrent requests for different repositories.
 */
interface AuthScope {
  /** Named by the caller, such as `owner/repo#1`. Wins over the checkout. */
  explicit?: AuthTarget;
  /** Read from the checkout's `origin` remote. */
  inferred?: AuthTarget;
}

const scope = new AsyncLocalStorage<AuthScope>();

/** Wrap a complete command so every request it makes shares one target record. */
export function runWithAuthScope<T>(work: () => Promise<T>): Promise<T> {
  return scope.run({}, work);
}

/** Record the command's repository; a no-op outside `runWithAuthScope`. */
export function setAuthTarget(
  repository: { owner: string; name: string },
  kind: "explicit" | "inferred",
): void {
  const current = scope.getStore();
  if (current) current[kind] = { owner: repository.owner, repo: repository.name };
}

export function currentAuthTarget(): AuthTarget | undefined {
  const current = scope.getStore();
  return current?.explicit ?? current?.inferred;
}

/** `/repos/{owner}/{repo}/…` */
export function authTargetFromRestPath(path: string): AuthTarget | undefined {
  const match = /^\/repos\/([^/?#]+)\/([^/?#]+)/.exec(path);
  return match ? { owner: match[1]!, repo: match[2]! } : undefined;
}

/** `owner` plus `repo` (or `name`) string variables. */
export function authTargetFromGraphqlVars(vars: Record<string, unknown>): AuthTarget | undefined {
  const { owner, repo, name } = vars;
  const repository = typeof repo === "string" ? repo : name;
  return typeof owner === "string" && typeof repository === "string"
    ? { owner, repo: repository }
    : undefined;
}
