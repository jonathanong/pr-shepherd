import { isCcrTransport } from "./transport.mts";
import type { RepoInfo } from "./client.mts";
import type { PrComment, Review, ReviewThread, CommentAuthorAssociation } from "../types.mts";
import { GitHubRequestError } from "./errors.mts";
import { EXIT } from "../exit-codes.mts";
import {
  readRestPages,
  restRepoPath,
  restArray,
  restObject,
  restNumber,
  restBoolean,
  malformedRest,
} from "./rest-reader-core.mts";
import { recordRestIdentity, recordThreadIdentity, restThreadId } from "./rest-identities.mts";
import { parseCreatedAt } from "./batch-parser-helpers.mts";
import { restCommentAuthorFields as authorFields } from "./rest-comment-authorship.mts";
import { validateRestReviews } from "./rest-review-read.mts";
import { validateRestComments, feedbackIdsMatch } from "./rest-feedback-validation.mts";
import { readRestViewerLogin } from "./rest-viewer-read.mts";

export interface RestComment {
  id: number;
  node_id: string;
  body: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  user: { login: string; type: string } | null;
  author_association: CommentAuthorAssociation;
  in_reply_to_id?: number;
  pull_request_review_id?: number;
  path?: string;
  line?: number | null;
  start_line?: number | null;
}
export interface RestReview extends RestComment {
  state: string;
  commit_id: string;
  submitted_at?: string | null;
}
interface RestThread {
  resolved: boolean;
  outdated: boolean;
  path: string | null;
  line: number | null;
  comment_ids: number[];
}
export async function readRestFeedback(
  pr: number,
  repo: RepoInfo,
  knownViewerLogin?: string | null,
) {
  const prefix = restRepoPath(repo);
  let inline = (await readRestPages<RestComment>(`${prefix}/pulls/${pr}/comments`)).nodes;
  const issue = (await readRestPages<RestComment>(`${prefix}/issues/${pr}/comments`)).nodes;
  const reviews = (await readRestPages<RestReview>(`${prefix}/pulls/${pr}/reviews`)).nodes;
  if (
    new Set(issue.map((comment) => comment.id)).size !== issue.length ||
    new Set(reviews.map((review) => review.id)).size !== reviews.length
  )
    malformedRest("duplicate feedback IDs");
  validateRestReviews(reviews);
  validateRestComments([...inline, ...issue, ...reviews]);
  let statuses = await readRestThreadStatuses(`${prefix}/pulls/${pr}/ccr/review_threads`);
  if (statuses && !feedbackIdsMatch(inline, statuses)) {
    // A reviewer can add or delete comments between these independently paginated reads.
    // Retry both resources, with thread membership first, before certifying the join.
    statuses = await readRestThreadStatuses(`${prefix}/pulls/${pr}/ccr/review_threads`);
    inline = (await readRestPages<RestComment>(`${prefix}/pulls/${pr}/comments`)).nodes;
    validateRestComments(inline);
    if (statuses && !feedbackIdsMatch(inline, statuses))
      throw new GitHubRequestError(
        "Pull request feedback changed while REST snapshot was being read; retry",
        { status: 409, exitCodeOverride: EXIT.TEMPFAIL },
      );
  }
  for (const comment of [...inline, ...issue, ...reviews]) {
    await recordRestIdentity(
      repo,
      pr,
      comment.node_id,
      String(comment.id),
      "state" in comment ? "review" : "comment",
    );
  }
  let unavailable: { field: string; reason: string }[] = [];
  if (!statuses && inline.length > 0)
    unavailable = [
      {
        field: "reviewThreads.status",
        reason: "REST has no resolved/outdated thread state; CCR review_threads is unavailable",
      },
    ];
  const inlineMap = new Map(inline.map((comment) => [comment.id, comment]));
  if (inlineMap.size !== inline.length) malformedRest("duplicate inline comment IDs");
  const groups: { id: number; comments: RestComment[]; status?: RestThread }[] = [];
  if (statuses) {
    for (const status of statuses) {
      const comments = status.comment_ids.map((id) => inlineMap.get(id)!);
      const root = comments[0]!;
      if (root.in_reply_to_id != null) malformedRest("CCR thread root is a reply");
      for (const reply of comments.slice(1))
        if (reply.in_reply_to_id !== root.id)
          malformedRest("CCR reply does not belong to its root");
      groups.push({ id: root.id, comments, status });
    }
  } else {
    for (const comment of inline.filter((comment) => comment.in_reply_to_id == null)) {
      groups.push({
        id: comment.id,
        comments: [comment, ...inline.filter((reply) => reply.in_reply_to_id === comment.id)],
      });
    }
    if (groups.reduce((sum, group) => sum + group.comments.length, 0) !== inline.length)
      malformedRest("inline comment reply has no root");
  }
  const threads: ReviewThread[] = [];
  const viewerLogin =
    knownViewerLogin === undefined ? await readRestViewerLogin() : knownViewerLogin;
  for (const group of groups) {
    const root = group.comments[0]!;
    const id = restThreadId(String(group.id));
    await recordThreadIdentity(repo, pr, id, String(group.id));
    const review = reviews.find((review) => review.id === root.pull_request_review_id);
    threads.push({
      id,
      ...(group.status
        ? { isResolved: group.status.resolved, isOutdated: group.status.outdated }
        : {}),
      path: group.status ? group.status.path : (root.path ?? null),
      line: group.status ? group.status.line : (root.line ?? null),
      startLine: root.start_line ?? null,
      ...(review ? { reviewId: review.node_id } : {}),
      ...authorFields(root, viewerLogin),
      body: root.body ?? "",
      url: root.html_url,
      createdAtUnix: parseCreatedAt(root.created_at),
      comments: group.comments.map((comment) => ({
        id: comment.node_id,
        ...(review ? { reviewId: review.node_id } : {}),
        ...authorFields(comment, viewerLogin),
        body: comment.body ?? "",
        url: comment.html_url,
        createdAtUnix: parseCreatedAt(comment.created_at),
      })),
    });
  }
  const comments: PrComment[] = issue.map((comment) => ({
    id: comment.node_id,
    ...authorFields(comment),
    body: comment.body ?? "",
    url: comment.html_url,
    createdAtUnix: parseCreatedAt(comment.created_at),
  }));
  return { threads, comments, reviews, unavailable, viewerLogin };
}
async function readRestThreadStatuses(path: string): Promise<RestThread[] | undefined> {
  if (!isCcrTransport()) return undefined;
  try {
    const statuses = (await readRestPages<RestThread>(path)).nodes;
    for (const status of statuses) {
      restObject(status, "CCR thread");
      restBoolean(status.resolved, "CCR thread resolved");
      restBoolean(status.outdated, "CCR thread outdated");
      restArray(status.comment_ids, "CCR comment_ids");
      if (status.path !== null && typeof status.path !== "string") malformedRest("CCR thread path");
      if (status.line !== null) restNumber(status.line, "CCR thread line");
      if (status.comment_ids.length === 0) malformedRest("CCR thread has no root comment");
      for (const id of status.comment_ids) restNumber(id, "CCR comment ID");
    }
    return statuses;
  } catch (error) {
    if (!(error instanceof GitHubRequestError) || error.status !== 404) throw error;
    return undefined;
  }
}
export function restReviewToReview(review: RestReview): Review {
  return {
    id: review.node_id,
    ...authorFields(review),
    body: review.body ?? "",
    url: review.html_url,
    ...(review.commit_id && { commitOid: review.commit_id }),
    ...(review.submitted_at && { createdAtUnix: parseCreatedAt(review.submitted_at) }),
  };
}
