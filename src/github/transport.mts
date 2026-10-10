import { AsyncLocalStorage } from "node:async_hooks";
import { loadConfig } from "../config/load.mts";
import { GitHubRequestError, isRetryableGraphQlInternal } from "./errors.mts";
import { isTransportError } from "./http-utils.mts";
import { rateLimitKind } from "./rate-limit-kind.mts";
import { parseGithubTransport, type GithubTransport } from "./transport-mode.mts";
import { appendEntry } from "../log/log-file.mts";

export type { GithubTransport } from "./transport-mode.mts";

interface TransportState {
  fallback: boolean;
  ccr: boolean;
}
interface TransportContext {
  mode: GithubTransport;
  state: TransportState;
  verbose?: boolean;
}
const context = new AsyncLocalStorage<TransportContext>();

function configuredMode(): GithubTransport {
  return loadConfig().github?.transport ?? "auto";
}

export function getGithubTransport(): "graphql" | "rest" {
  const current = context.getStore();
  const mode = current?.mode ?? configuredMode();
  if (mode !== "auto") return mode;
  return current?.state.fallback || process.env["CLAUDE_CODE_REMOTE"] === "true"
    ? "rest"
    : "graphql";
}

/** Cloud-session marker or the specific GraphQL refusal observed by this client. */
export function isCcrTransport(): boolean {
  return process.env["CLAUDE_CODE_REMOTE"] === "true" || context.getStore()?.state.ccr === true;
}

/** Each client retains its auto fallback without sharing state with other clients. */
export function createGithubTransportRunner(
  mode?: GithubTransport,
  options?: { verbose?: boolean },
) {
  if (mode !== undefined) parseGithubTransport(mode);
  const state: TransportState = { fallback: false, ccr: false };
  return function run<T>(work: () => Promise<T>, override?: GithubTransport): Promise<T> {
    const selected = parseGithubTransport(override ?? mode ?? configuredMode());
    return context.run({ mode: selected, state, verbose: options?.verbose }, work);
  };
}

/** Wrap the complete command (including every poll tick) in one transport scope. */
export function runWithGithubTransport<T>(
  mode: GithubTransport | undefined,
  work: () => Promise<T>,
  options?: { verbose?: boolean },
): Promise<T> {
  const current = context.getStore();
  if (current && (mode === undefined || mode === current.mode)) return work();
  return createGithubTransportRunner(mode, options)(work);
}

function responseMessage(error: GitHubRequestError): string {
  const raw = error.responseMessage ?? "";
  try {
    const parsed = JSON.parse(raw) as { message?: unknown };
    if (typeof parsed.message === "string") return parsed.message;
  } catch {}
  return raw.trim();
}

function fallbackReason(error: unknown): "refused" | "ccr" | "ambiguous" | undefined {
  if (isTransportError(error)) return "ambiguous";
  if (!(error instanceof GitHubRequestError)) return undefined;
  if (
    /bad credentials|requires authentication|resource not accessible|insufficient permission|access denied/i.test(
      error.responseMessage ?? "",
    )
  )
    return undefined;
  // Mixed GraphQL errors must retain credential, permission and validation failures.
  if (
    error.status === 401 ||
    error.graphqlErrors?.some(
      (entry) =>
        /resource not accessible|permission|forbidden|unauthorized|unknown (?:field|argument)|cannot query|variable .* (?:invalid|required)/i.test(
          entry.message,
        ) ||
        ["FORBIDDEN", "UNAUTHORIZED", "GRAPHQL_VALIDATION_FAILED", "NOT_FOUND"].includes(
          entry.type?.toUpperCase() ?? "",
        ),
    )
  )
    return undefined;
  const throttle = rateLimitKind(error);
  if (throttle === "secondary") return undefined;
  if (
    isRetryableGraphQlInternal(error.graphqlErrors) &&
    error.graphqlErrors?.some((entry) => !isRetryableGraphQlInternal([entry]))
  )
    return undefined;
  if (
    error.status === 403 &&
    responseMessage(error).includes("GitHub GraphQL is not available from Claude Code sessions")
  ) {
    return "ccr";
  }
  // Exhausting the quota does not prove an INTERNAL/5xx mutation was refused.
  if (error.status >= 500 || isRetryableGraphQlInternal(error.graphqlErrors)) return "ambiguous";
  if (
    throttle === "primary" &&
    (error.status === 403 ||
      error.status === 429 ||
      error.graphqlErrors?.some(
        (entry) => /rate limit/i.test(entry.message) || entry.type === "RATE_LIMITED",
      )) &&
    (!error.rateLimit?.resource || error.rateLimit.resource === "graphql")
  )
    return "refused";
  return undefined;
}

/** Allow best-effort GraphQL reads to propagate failures eligible for transport fallback. */
export function isGithubReadFallbackError(error: unknown): boolean {
  return fallbackReason(error) !== undefined;
}

/** Choose named implementations; HTTP documents are never interpreted as REST routes. */
export async function githubOperation<T>(
  name: string,
  graphql: () => Promise<T>,
  rest: () => Promise<T>,
  options?: { mutation?: boolean },
): Promise<T> {
  const current = context.getStore();
  if (!current)
    return runWithGithubTransport(undefined, () => githubOperation(name, graphql, rest, options));
  if (getGithubTransport() === "rest") return rest();
  try {
    return await graphql();
  } catch (error) {
    const reason = fallbackReason(error);
    if (current.mode !== "auto" || reason === undefined) throw error;
    if (!current.state.fallback) {
      const message = `pr-shepherd: GitHub transport switched to REST after ${name} (${reason}).\n`;
      appendEntry(message);
      if (current.verbose) process.stderr.write(message);
    }
    current.state.fallback = true;
    if (reason === "ccr") current.state.ccr = true;
    // An ambiguous mutation may already have succeeded; never replay it.
    if (options?.mutation && reason === "ambiguous") throw error;
    return rest();
  }
}
