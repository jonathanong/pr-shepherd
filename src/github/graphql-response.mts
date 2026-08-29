import { EXIT } from "../exit-codes.mts";
import { GitHubRequestError, type GitHubGraphQlError } from "./errors.mts";
import type { RateLimitInfo } from "./http-utils.mts";

export function parseGraphQlPayload<T>(
  parsed: unknown,
  status: number,
  rateLimit: RateLimitInfo | null,
  retryAfterSeconds: number | undefined,
): { data: T | null; errors?: GitHubGraphQlError[] } {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw malformedGraphQlResponse("expected a JSON object", status, rateLimit, retryAfterSeconds);
  }
  const record = parsed as Record<string, unknown>;
  let errors: GitHubGraphQlError[] | undefined;
  if (record["errors"] !== undefined) {
    if (
      !Array.isArray(record["errors"]) ||
      !record["errors"].every(
        (error) =>
          typeof error === "object" &&
          error !== null &&
          typeof (error as Record<string, unknown>)["message"] === "string",
      )
    ) {
      throw malformedGraphQlResponse(
        "errors field is not an array of GraphQL errors",
        status,
        rateLimit,
        retryAfterSeconds,
      );
    }
    errors = record["errors"].map((error) => parseGraphQlError(error as Record<string, unknown>));
  }
  if (!("data" in record)) {
    if (errors?.length) return { data: null, errors };
    throw malformedGraphQlResponse("missing data field", status, rateLimit, retryAfterSeconds);
  }
  if (
    record["data"] !== null &&
    (typeof record["data"] !== "object" || Array.isArray(record["data"]))
  ) {
    throw malformedGraphQlResponse(
      "data field is not an object or null",
      status,
      rateLimit,
      retryAfterSeconds,
    );
  }
  return { data: (record["data"] as T | null) ?? null, errors };
}

function parseGraphQlError(error: Record<string, unknown>): GitHubGraphQlError {
  const parsed: GitHubGraphQlError = { message: error["message"] as string };
  if ("path" in error) parsed.path = error["path"];
  if (typeof error["type"] === "string") parsed.type = error["type"];
  if (error["extensions"] !== undefined) parsed.extensions = error["extensions"];
  return parsed;
}

export function formatGraphQlErrors(errors: GitHubGraphQlError[] | undefined): string {
  return (errors ?? [])
    .map((error) => {
      const path = Array.isArray(error.path) ? error.path.map(String).join(".") : "";
      return path ? `${error.message} (path: ${path})` : error.message;
    })
    .join("; ");
}

function malformedGraphQlResponse(
  detail: string,
  status: number,
  rateLimit: RateLimitInfo | null,
  retryAfterSeconds: number | undefined,
): GitHubRequestError {
  // A response that fails to parse as valid GraphQL shape is an internal/unexpected
  // failure, not a precondition or permission problem — force EX_SOFTWARE rather
  // than letting the (likely 200) status fall through to EX_UNAVAILABLE.
  return new GitHubRequestError(`Malformed GitHub GraphQL response: ${detail}`, {
    status,
    rateLimit: rateLimit ?? undefined,
    retryAfterSeconds,
    exitCodeOverride: EXIT.SOFTWARE,
  });
}
