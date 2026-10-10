import type { GitHubRequestError } from "./errors.mts";
import { rest } from "./rest-http.mts";

/** Decide whether a quota-shaped GraphQL error needs proof from REST's resource endpoint. */
export function needsGraphQlQuotaProbe(error: GitHubRequestError): boolean {
  const response = error.responseMessage ?? "";
  const messages = [
    response,
    error.message,
    ...(error.graphqlErrors?.map((entry) => entry.message) ?? []),
  ].join(" ");
  if (
    error.retryAfterSeconds !== undefined ||
    /secondary (?:rate )?limit|abuse detection/i.test(messages)
  )
    return false;
  if (error.rateLimit && (!error.rateLimit.resource || error.rateLimit.resource === "graphql"))
    return false;
  const errors = error.graphqlErrors;
  if (hasMixedGraphQlQuotaErrors(errors)) return false;
  const quotaRefusal = errors?.length
    ? errors.every(isQuotaError)
    : /api rate limit exceeded/i.test(parseResponseMessage(response) || error.message);
  return quotaRefusal && [200, 403, 429].includes(error.status);
}

export function hasMixedGraphQlQuotaErrors(errors: GitHubRequestError["graphqlErrors"]): boolean {
  return !!errors?.some(isQuotaError) && !errors.every(isQuotaError);
}

function isQuotaError(error: NonNullable<GitHubRequestError["graphqlErrors"]>[number]): boolean {
  return (
    error.type?.toUpperCase() === "RATE_LIMITED" || /api rate limit exceeded/i.test(error.message)
  );
}

/** REST can prove exhaustion when the GraphQL refusal has no usable quota sample. */
export async function isPrimaryGraphQlQuotaExhausted(): Promise<boolean> {
  try {
    const value = await rest<unknown>("GET", "/rate_limit");
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const resources = (value as Record<string, unknown>)["resources"];
    if (!resources || typeof resources !== "object" || Array.isArray(resources)) return false;
    const graphql = (resources as Record<string, unknown>)["graphql"];
    if (!graphql || typeof graphql !== "object" || Array.isArray(graphql)) return false;
    const remaining = (graphql as Record<string, unknown>)["remaining"];
    return typeof remaining === "number" && Number.isFinite(remaining) && remaining <= 0;
  } catch {
    return false;
  }
}

function parseResponseMessage(response: string): string {
  try {
    const parsed = JSON.parse(response) as { message?: unknown };
    if (typeof parsed.message === "string") return parsed.message;
  } catch {}
  return response.trim();
}
