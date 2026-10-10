import { replyToThread, isAmbiguousMutationError } from "./rest-reply.mts";
import { restWithRateLimit } from "../github/http.mts";
import type { RepoInfo } from "../github/client.mts";
import { GitHubRequestError } from "../github/errors.mts";
import { isCcrTransport } from "../github/transport.mts";
import { UnsupportedRestOperationError } from "../github/unsupported-rest.mts";
import { resolveRestIdentity, resolveRestThreadRoot } from "../github/rest-identities.mts";
import { readRestPages, restRepoPath } from "../github/rest-reader-core.mts";
import { addPrShepherdMarker } from "./marker.mts";
import { rateLimitFromError } from "./rate-limit.mts";
import type { RateLimitInfo } from "../github/http-utils.mts";
import { markMutationDenied } from "../state/seen-comments.mts";
import { readRestFeedback } from "../github/rest-feedback-read.mts";
import { threadTranscriptBody } from "../threads/transcript.mts";

async function reviewNumericId(repo: RepoInfo, pr: number, id: string): Promise<string> {
  if (/^[1-9][0-9]*$/.test(id)) return id;
  try {
    const entry = await resolveRestIdentity(id, "review");
    if (
      entry.pr === pr &&
      entry.repo.owner.toLowerCase() === repo.owner.toLowerCase() &&
      entry.repo.name.toLowerCase() === repo.name.toLowerCase()
    )
      return entry.numericId;
  } catch {}
  const reviews = (
    await readRestPages<{ id: number; node_id: string }>(
      `${restRepoPath(repo)}/pulls/${pr}/reviews`,
    )
  ).nodes;
  const target = reviews.find((review) => review.node_id === id);
  if (!target)
    throw new Error(`Cannot address review ${id} through REST in ${repo.owner}/${repo.name}#${pr}`);
  return String(target.id);
}

async function rememberDenied(
  input: { repo?: RepoInfo; pr?: number },
  id: string,
  kind: string,
): Promise<void> {
  let key: { owner: string; repo: string; pr: number } | undefined;
  try {
    const identity =
      input.repo && input.pr !== undefined ? undefined : await resolveRestIdentity(id);
    const repo = input.repo ?? identity!.repo;
    const pr = input.pr ?? identity!.pr;
    key = { owner: repo.owner, repo: repo.name, pr };
    const feedback = await readRestFeedback(pr, repo);
    const root = kind === "dismiss" ? undefined : await resolveRestThreadRoot(repo, pr, id);
    const body =
      kind === "dismiss"
        ? feedback.reviews.find((review) => review.node_id === id || String(review.id) === id)?.body
        : feedback.threads.find(
            (thread) => thread.id === id || thread.id === `rest-thread-${root}`,
          );
    if (body !== undefined && body !== null)
      await markMutationDenied(
        key,
        id,
        typeof body === "string" ? body : threadTranscriptBody(body),
      );
  } catch {
    // Generated mutations already surfaced this revision; a failed refresh must not retry it.
    if (key) await markMutationDenied(key, id);
  }
}

export async function applyRestReviewChunk(input: {
  repo?: RepoInfo;
  pr?: number;
  replyIds: string[];
  resolveIds: string[];
  minimizeIds: string[];
  dismissIds: string[];
  message: string;
}): Promise<{
  data: Record<string, unknown>;
  errors: Array<{ message: string; path: string[] }>;
  rateLimit?: RateLimitInfo;
  retryAfterSeconds?: number;
  restStopped?: true;
}> {
  const result: Awaited<ReturnType<typeof applyRestReviewChunk>> = { data: {}, errors: [] };
  const ops = [
    ...input.replyIds.map((id, index) => ({ id, alias: `p${index}`, kind: "reply" })),
    ...input.resolveIds.map((id, index) => ({ id, alias: `r${index}`, kind: "resolve" })),
    ...input.minimizeIds.map((id, index) => ({ id, alias: `m${index}`, kind: "minimize" })),
    ...input.dismissIds.map((id, index) => ({ id, alias: `d${index}`, kind: "dismiss" })),
  ];
  for (const op of ops) {
    try {
      if (op.kind === "minimize") throw new UnsupportedRestOperationError("minimizeComment");
      let repo = input.repo;
      let pr = input.pr;
      if (!repo || pr === undefined) {
        const identity = await resolveRestIdentity(
          op.id,
          op.kind === "dismiss" ? "review" : "thread",
        );
        repo = identity.repo;
        pr = identity.pr;
      }
      const prefix = `${restRepoPath(repo)}/pulls/${pr}`;
      if (op.kind === "reply") {
        const root = await resolveRestThreadRoot(repo, pr, op.id);
        const response = await replyToThread(repo, pr, root, addPrShepherdMarker(input.message));
        result.rateLimit = response.rateLimit;
        result.data[op.alias] = { comment: { id: response.id } };
      } else if (op.kind === "resolve") {
        if (!isCcrTransport())
          throw new UnsupportedRestOperationError(
            "resolveReviewThread",
            "thread resolution requires the cloud CCR proxy",
          );
        const root = await resolveRestThreadRoot(repo, pr, op.id);
        const response = await restWithRateLimit<{ resolved?: boolean }>(
          "POST",
          `${prefix}/ccr/comments/${root}/resolve`,
        );
        result.rateLimit = response.rateLimit;
        if (response.data?.resolved !== true)
          throw new Error("CCR resolve did not confirm the thread was resolved");
        result.data[op.alias] = { thread: { isResolved: true } };
      } else {
        const review = await reviewNumericId(repo, pr, op.id);
        const response = await restWithRateLimit<{ state?: string }>(
          "PUT",
          `${prefix}/reviews/${review}/dismissals`,
          { message: input.message },
        );
        result.rateLimit = response.rateLimit;
        if (response.data?.state !== "DISMISSED")
          throw new Error("Review dismissal did not confirm DISMISSED state");
        result.data[op.alias] = { pullRequestReview: { state: "DISMISSED" } };
      }
      if (result.rateLimit?.remaining === 0) {
        result.errors.push({ message: "GitHub REST core rate limit remaining is 0", path: [] });
        result.restStopped = true;
        break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push({ message, path: [op.alias] });
      const stop = rateLimitFromError(error, message);
      if (!stop && error instanceof GitHubRequestError && error.status === 403)
        await rememberDenied(input, op.id, op.kind);
      if (error instanceof GitHubRequestError) {
        result.rateLimit = error.rateLimit;
        result.retryAfterSeconds = error.retryAfterSeconds;
      }
      if (stop || isAmbiguousMutationError(error) || message.includes("outcome is uncertain")) {
        result.restStopped = true;
        break;
      }
    }
  }
  return result;
}

export { isAmbiguousMutationError } from "./rest-reply.mts";
