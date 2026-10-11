import { mergeResultFactory } from "./apply-merge-output.mts";
import {
  validateApplyMergeOptions,
  validateApplyMergeTarget,
  sameMergeOptions,
} from "./apply-merge-options.mts";
import { validateRestStackMergeReadiness } from "./rest-stack-merge-readiness.mts";
export { validateApplyMergeOptions } from "./apply-merge-options.mts";
import { EXIT, ShepherdError } from "../exit-codes.mts";
import { getCurrentPrNumber, getRepoInfo } from "../github/client.mts";
import { GitHubRequestError } from "../github/errors.mts";
import { mergedResponse, readPull } from "./apply-merge-pull.mts";
import { withRestConditionalScope } from "../github/rest-conditional-scope.mts";
import { getGithubTransport } from "../github/transport.mts";
import {
  getRestMerge,
  matchesRestMergeRequest,
  requestRestMerge,
  type RestMergeOptions,
  type RestMergeResponse,
} from "../github/rest-merge.mts";
import {
  claimMergeRequest,
  replaceFailedMergeRequest,
  readMergeRequest,
  writeMergeRequest,
  writeMergeRequestStatus,
  type MergeRequestRecord,
} from "../state/merge-request.mts";

export interface ApplyMergeInput extends RestMergeOptions {
  prNumber?: number;
  targetRepository?: { owner: string; name: string };
}
export interface ApplyMergeResult extends RestMergeResponse {
  pr: number;
  repo: string;
  /** A mutation may already have reached GitHub. No new request will be issued. */
  uncertain?: true;
  note?: string;
}
/** Submit one guarded asynchronous request, or resume its existing UUID without resubmitting. */
export async function runApplyMerge(input: ApplyMergeInput): Promise<ApplyMergeResult> {
  validateApplyMergeOptions(input);
  validateApplyMergeTarget(input, input.prNumber);
  if (getGithubTransport() !== "rest")
    throw new ShepherdError(
      "apply merge requires REST transport; pass --transport rest",
      EXIT.USAGE,
    );
  const repo = input.targetRepository ?? (await getRepoInfo());
  const pr = input.prNumber ?? (await getCurrentPrNumber());
  if (!pr)
    throw new ShepherdError(
      "No open PR found for current branch. Pass a PR explicitly.",
      EXIT.UNAVAILABLE,
    );
  validateApplyMergeTarget(input, pr);
  const key = { owner: repo.owner, repo: repo.name, pr };
  // The PR's own conditional scope: the pull and stack reads share the ETag cache the iterate tick
  // that printed this command just filled, so an unchanged resource answers a free 304 whose
  // stored body equals GitHub's current one. The merge-async GET and PUT stay unconditional.
  return withRestConditionalScope(key, () => submitApplyMerge(input, repo, pr, key));
}

async function submitApplyMerge(
  input: ApplyMergeInput,
  repo: { owner: string; name: string },
  pr: number,
  key: { owner: string; repo: string; pr: number },
): Promise<ApplyMergeResult> {
  const options: RestMergeOptions = {
    requireSha: input.requireSha,
    mergeAction: input.mergeAction,
    ...(input.mergeMethod && { mergeMethod: input.mergeMethod }),
    ...(input.expectedStack && { expectedStack: input.expectedStack }),
  };
  const { failed, project } = mergeResultFactory(pr, repo, options);
  const existing = await readMergeRequest(key);
  const pull = await readPull(repo, pr);
  if (pull.merged === true) return project(mergedResponse(pull, "Pull request is merged."));
  if (pull.head?.sha !== input.requireSha)
    return failed("Current PR head does not match --require-sha; no merge request was submitted.");
  if (pull.state !== "open" || pull.draft !== false)
    return failed("Pull request must be open and ready for review.");
  const replaceFailed =
    existing &&
    !existing.uncertain &&
    ((existing.response?.status === "failed" && !sameMergeOptions(existing.options, options)) ||
      (existing.response?.status === "enqueued" &&
        existing.options.requireSha !== options.requireSha));
  if (existing && !replaceFailed) {
    if (!sameMergeOptions(existing.options, options))
      return failed(
        "A persisted asynchronous merge request has different options; reconcile its outcome before requesting another merge.",
        true,
      );
    if (existing.response?.status !== undefined && existing.response.status !== "pending")
      return {
        ...project(existing.response),
        ...(existing.uncertain && { uncertain: true }),
        ...(existing.response.status === "enqueued" && {
          note: "This is the recorded request outcome; current merge-queue membership is not confirmed.",
        }),
      };
    if (!existing.uuid)
      return failed(
        "The previous merge submission has an unknown outcome and no UUID. The PR is not merged; no duplicate request was submitted.",
        true,
      );
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
      if (error instanceof GitHubRequestError && error.status === 404) {
        const latest = await readPull(repo, pr);
        if (latest.merged === true)
          return project(
            mergedResponse(latest, "Pull request is merged; its asynchronous request has expired."),
          );
        return failed(
          "The asynchronous merge UUID expired or is unavailable. The PR is not merged; its request outcome is unknown and no duplicate was submitted.",
          true,
        );
      }
      throw error;
    }
  }
  let record: MergeRequestRecord = {
    version: 1,
    options,
    startedAtUnix: Math.floor(Date.now() / 1000),
  };
  await validateRestStackMergeReadiness(pr, repo, input.requireSha, input.expectedStack);
  if (
    !(existing
      ? await replaceFailedMergeRequest(key, existing, record)
      : await claimMergeRequest(key, record))
  )
    return failed(
      "Another merge request is already being submitted; resume this command after its outcome is recorded.",
      true,
    );
  // Recovery may have selected an older durable intent; retain its unique generation token.
  record = (await readMergeRequest(key))!;
  let response: RestMergeResponse;
  try {
    response = await requestRestMerge(repo, pr, options);
  } catch (error) {
    if (error instanceof GitHubRequestError && error.status >= 400 && error.status < 500) {
      await writeMergeRequest(key, {
        ...record,
        response: {
          status: "failed",
          details: { message: error.responseMessage ?? error.message },
        },
      });
      throw error;
    }
    return failed(
      `Merge submission outcome is unknown: ${error instanceof Error ? error.message : String(error)}. No duplicate request will be submitted.`,
      true,
    );
  }
  if (response.status === "pending" && !matchesRestMergeRequest(response, options)) {
    const mismatch = failed(
      "GitHub returned a pending merge with different or unverifiable options; its UUID was not adopted.",
      true,
    );
    await writeMergeRequest(key, {
      ...record,
      response: { status: mismatch.status, details: mismatch.details },
      uncertain: true,
    });
    return mismatch;
  }
  await writeMergeRequest(key, {
    ...record,
    ...(response.details.uuid && response.status === "pending" && { uuid: response.details.uuid }),
    response,
  });
  return project(response);
}
