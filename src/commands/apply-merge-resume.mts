import type { RepoInfo } from "../github/client.mts";
import { GitHubRequestError } from "../github/errors.mts";
import {
  getRestMerge,
  matchesRestMergeRequest,
  requestRestSyncMerge,
  type RestMergeOptions,
} from "../github/rest-merge.mts";
import {
  clearMergeRequest,
  writeMergeRequestStatus,
  type MergeRequestRecord,
} from "../state/merge-request.mts";
import { mergedResponse, readPull } from "./apply-merge-pull.mts";
import type { mergeResultFactory } from "./apply-merge-output.mts";
import type { ApplyMergeResult } from "./apply-merge.mts";

interface ResumeContext {
  repo: RepoInfo;
  pr: number;
  key: { owner: string; repo: string; pr: number };
  existing: MergeRequestRecord & { uuid: string };
  options: RestMergeOptions;
  factory: ReturnType<typeof mergeResultFactory>;
}

/** Resume a recorded asynchronous request, falling back to the synchronous merge when unreadable. */
export async function resumeMergeRequest(ctx: ResumeContext): Promise<ApplyMergeResult> {
  const { repo, pr, key, existing, options, factory } = ctx;
  const { failed, project } = factory;
  try {
    const response = await getRestMerge(repo, pr, existing.uuid);
    if (
      response.status === "pending" &&
      (!matchesRestMergeRequest(response, options) || response.details.uuid !== existing.uuid)
    )
      return failed(
        "Asynchronous merge status does not match the persisted guarded request.",
        true,
      );
    await writeMergeRequestStatus(key, { ...existing, response });
    return project(response);
  } catch (error) {
    // 404: the UUID expired. 403: the token cannot read merge-async status at all (for example a
    // GitHub App installation without that permission). Either way the status is unknown, so the
    // pull itself decides, and an unmerged direct merge converges through the synchronous route.
    if (!(error instanceof GitHubRequestError) || (error.status !== 404 && error.status !== 403))
      throw error;
    const latest = await readPull(repo, pr);
    if (latest.merged === true)
      return project(
        mergedResponse(latest, "Pull request is merged; its asynchronous status was unreadable."),
      );
    // The synchronous route guards the head SHA itself; queue, default, method-less, and native
    // stack requests have no synchronous equivalent, so their unknown outcome stays blocked.
    if (options.mergeAction !== "direct_merge" || !options.mergeMethod || options.expectedStack)
      return failed(
        `The asynchronous merge status is unavailable (${error.status}). The PR is not merged; its request outcome is unknown and no duplicate was submitted.`,
        true,
      );
    return syncFallback(ctx, options.mergeMethod);
  }
}

async function syncFallback(
  ctx: ResumeContext,
  mergeMethod: NonNullable<RestMergeOptions["mergeMethod"]>,
): Promise<ApplyMergeResult> {
  const { repo, pr, key, options, factory } = ctx;
  try {
    const response = await requestRestSyncMerge(repo, pr, {
      requireSha: options.requireSha,
      mergeMethod,
    });
    await clearMergeRequest(key);
    return factory.project({
      ...response,
      details: {
        ...response.details,
        message:
          `${response.details.message ?? ""} (merged synchronously: the asynchronous status was unreadable)`.trim(),
      },
    });
  } catch (error) {
    // A definite refusal (not mergeable, head changed) retires the stale request so the next
    // command starts a fresh guarded attempt; an unknown outcome keeps the record and retries.
    if (error instanceof GitHubRequestError && error.status >= 400 && error.status < 500)
      await clearMergeRequest(key);
    throw error;
  }
}
