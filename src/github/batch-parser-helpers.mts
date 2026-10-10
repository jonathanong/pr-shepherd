import type {
  AuthorType,
  CheckConclusion,
  CheckRun,
  CheckStatus,
  Review,
  ReviewThread,
} from "../types.mts";
import type { CheckAnnotation } from "../types/check-annotations.mts";
import type { RawContextNode } from "./batch-raw-types.mts";
import { toCheckAnnotation, type RawCheckAnnotation } from "./check-annotation-shape.mts";
import { normalizeAuthorType } from "../comments/authors.mts";

export function mapAuthorType(
  typeName: string | undefined | null,
  login?: string | undefined | null,
): AuthorType {
  return normalizeAuthorType(typeName, login);
}

export function parseCreatedAt(iso: string): number {
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

function extractRunId(url: string | undefined | null): string | null {
  if (!url) return null;
  const m = /\/runs\/(\d+)/.exec(url);
  return m ? (m[1] ?? null) : null;
}

/** Stringify a GraphQL Workflow.databaseId, when present, for use as a check-grouping key. */
function resolveWorkflowId(databaseId: number | null | undefined): string | undefined {
  return databaseId !== null && databaseId !== undefined ? String(databaseId) : undefined;
}

/** Map a GraphQL CheckRun context node to a CheckRun. */
export function mapCheckRunNode(
  node: Extract<RawContextNode, { __typename: "CheckRun" }>,
): CheckRun {
  const event = node.checkSuite?.workflowRun?.event ?? null;
  const workflowName = node.checkSuite?.workflowRun?.workflow?.name?.trim() || undefined;
  const workflowId = resolveWorkflowId(node.checkSuite?.workflowRun?.workflow?.databaseId);
  const runId =
    node.checkSuite?.workflowRun?.databaseId != null
      ? String(node.checkSuite.workflowRun.databaseId)
      : extractRunId(node.detailsUrl);
  const summary = extractCheckRunSummary(node.title, node.summary);
  const rawCreatedAt = node.checkSuite?.workflowRun?.createdAt ?? node.checkSuite?.createdAt;
  const rawUpdatedAt = node.checkSuite?.workflowRun?.updatedAt ?? node.checkSuite?.updatedAt;
  const createdAtUnix = rawCreatedAt ? parseCreatedAt(rawCreatedAt) : undefined;
  const startedAtUnix = node.startedAt ? parseCreatedAt(node.startedAt) : undefined;
  const completedAtUnix = node.completedAt ? parseCreatedAt(node.completedAt) : undefined;
  const updatedAtUnix = rawUpdatedAt ? parseCreatedAt(rawUpdatedAt) : undefined;
  return {
    id: node.id,
    name: node.name,
    status: node.status as CheckRun["status"],
    conclusion: node.conclusion as CheckRun["conclusion"],
    source: "check_run",
    detailsUrl: node.detailsUrl ?? "",
    event,
    runId,
    ...(workflowName !== undefined && { workflowName }),
    ...(workflowId !== undefined && { workflowId }),
    ...(createdAtUnix !== undefined && { createdAtUnix }),
    ...(startedAtUnix !== undefined && { startedAtUnix }),
    ...(completedAtUnix !== undefined && { completedAtUnix }),
    ...(updatedAtUnix !== undefined && { updatedAtUnix }),
    ...(summary !== undefined && { summary }),
    ...(((node.annotations?.totalCount ?? 0) > 0 || (node.annotations?.nodes.length ?? 0) > 0) && {
      hasAnnotations: true as const,
    }),
    ...inlineAnnotationsField(node.id, node.annotations),
  };
}

/**
 * The complete annotation list when the first page already holds every annotation with its full
 * selection. A partial page (more than one annotation, or a node without the full fields) yields
 * nothing, so the caller still reads the run's annotations separately.
 */
function inlineAnnotationsField(
  checkRunId: string,
  annotations: Extract<RawContextNode, { __typename: "CheckRun" }>["annotations"],
): { inlineAnnotations?: CheckAnnotation[] } {
  const total = annotations?.totalCount;
  if (total === undefined || total < 1 || annotations!.nodes.length !== total) return {};
  const raws = annotations!.nodes.map(fullRawAnnotation);
  if (raws.some((raw) => raw === null)) return {};
  return {
    inlineAnnotations: (raws as RawCheckAnnotation[]).map((raw) =>
      toCheckAnnotation(checkRunId, raw),
    ),
  };
}

function fullRawAnnotation(
  node: Partial<RawCheckAnnotation> & { message: string },
): RawCheckAnnotation | null {
  if (typeof node.path !== "string" || typeof node.annotationLevel !== "string") return null;
  if (node.location === undefined || node.fullDatabaseId === undefined) return null;
  return {
    fullDatabaseId: node.fullDatabaseId,
    path: node.path,
    annotationLevel: node.annotationLevel,
    title: node.title ?? null,
    message: node.message,
    rawDetails: node.rawDetails ?? null,
    blobUrl: node.blobUrl ?? null,
    location: node.location,
  };
}

function extractCheckRunSummary(
  title: string | null | undefined,
  summary: string | null | undefined,
): string | undefined {
  const t = title?.trim();
  if (t) return t;
  const firstLine = summary
    ?.split("\n")
    ?.find((l) => l.trim() !== "")
    ?.trim();
  return firstLine || undefined;
}

export function latestApprovedLogins(latest: Array<{ login: string; state: string }>): Set<string> {
  return new Set(
    latest
      .filter((r) => r.login !== "unknown" && (r.state === "APPROVED" || r.state === "DISMISSED"))
      .map((r) => r.login),
  );
}

/**
 * A CR review is stale when its commit.oid differs from the PR head AND every
 * associated review thread is resolved or outdated. Reviews with no associated
 * threads are treated conservatively (not marked stale).
 */
export function isReviewStale(
  review: Review,
  headRefOid: string,
  reviewThreads: ReviewThread[],
): boolean {
  if (!review.commitOid || review.commitOid === headRefOid) return false;
  const associated = reviewThreads.filter((t) => t.reviewId === review.id);
  if (associated.length === 0) return false;
  return associated.every((t) => t.isResolved || t.isOutdated);
}

export function mapStatusContextState(state: string): {
  status: CheckStatus;
  conclusion: CheckConclusion;
} {
  switch (state) {
    case "SUCCESS":
      return { status: "COMPLETED", conclusion: "SUCCESS" };
    case "FAILURE":
    case "ERROR":
      return { status: "COMPLETED", conclusion: "FAILURE" };
    case "PENDING":
    case "EXPECTED":
    default:
      return { status: "IN_PROGRESS", conclusion: null };
  }
}
