import { restWithRateLimit } from "./rest-http.mts";
import { restRepoPath } from "./rest-reader-core.mts";
import type { RepoInfo } from "./client.mts";
import type { MergeMethod } from "../config/merge-method.mts";
import { GitHubRequestError } from "./errors.mts";
import { sanitizeBody } from "./http-utils.mts";
import type { RestMergeStackGuard } from "./rest-merge-stack-guard.mts";
export type { RestMergeStackGuard } from "./rest-merge-stack-guard.mts";

export type RestMergeAction = "direct_merge" | "merge_queue" | "default";
export interface RestMergeOptions {
  requireSha: string;
  mergeAction: RestMergeAction;
  mergeMethod?: MergeMethod;
  expectedStack?: RestMergeStackGuard;
}
export interface RestMergeResponse {
  status: "pending" | "enqueued" | "merged" | "failed";
  details: {
    message?: string;
    uuid?: string;
    expected_head_sha?: string;
    merge_action?: RestMergeAction;
    merge_method?: MergeMethod;
    bypass_rules?: boolean;
    sha?: string;
    [key: string]: unknown;
  };
}

function parseRestMergeResponse(raw: unknown): RestMergeResponse {
  if (raw === null || typeof raw !== "object")
    throw new Error("Invalid asynchronous merge response");
  const value = raw as Record<string, unknown>;
  if (
    !["pending", "enqueued", "merged", "failed"].includes(String(value["status"])) ||
    value["details"] === null ||
    typeof value["details"] !== "object" ||
    Array.isArray(value["details"])
  ) {
    throw new Error("Invalid asynchronous merge response");
  }
  return value as unknown as RestMergeResponse;
}

/** This named mutation is never retried after a network failure or server error. */
export async function requestRestMerge(
  repo: RepoInfo,
  pr: number,
  options: RestMergeOptions,
): Promise<RestMergeResponse> {
  const { data, status, rateLimit } = await restWithRateLimit(
    "PUT",
    `${restRepoPath(repo)}/pulls/${pr}/merge-async`,
    {
      sha: options.requireSha,
      merge_action: options.mergeAction,
      bypass_rules: false,
      ...(options.mergeAction === "direct_merge" && options.mergeMethod
        ? { merge_method: options.mergeMethod }
        : {}),
    },
    { acceptStatuses: [400, 409] },
  );
  try {
    return parseRestMergeResponse(data);
  } catch (error) {
    // Accepted 400/409 responses may contain an ordinary API error envelope,
    // rather than merge state. Retain their definite refusal for intent recovery.
    if (status !== undefined && status >= 400 && status < 500) {
      const responseMessage = sanitizeBody(JSON.stringify(data) ?? "");
      throw new GitHubRequestError(
        `Invalid asynchronous merge response: ${status} ${responseMessage}`,
        { status, rateLimit, responseMessage },
      );
    }
    // A malformed acknowledgement may follow a successful submission.
    throw error;
  }
}

export async function getRestMerge(
  repo: RepoInfo,
  pr: number,
  uuid: string,
): Promise<RestMergeResponse> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid))
    throw new Error("Invalid asynchronous merge UUID");
  const { data } = await restWithRateLimit(
    "GET",
    `${restRepoPath(repo)}/pulls/${pr}/merge-async/${uuid}`,
  );
  return parseRestMergeResponse(data);
}

/** Conflict requests must match the caller's guarded options before their UUID can be adopted. */
export function matchesRestMergeRequest(
  result: RestMergeResponse,
  options: RestMergeOptions,
): boolean {
  const details = result.details;
  return (
    details.expected_head_sha === options.requireSha &&
    details.merge_action === options.mergeAction &&
    details.bypass_rules === false &&
    (options.mergeMethod === undefined || details.merge_method === options.mergeMethod) &&
    typeof details.uuid === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(details.uuid)
  );
}
