// @ts-nocheck
/** REST projection for the poll-summary inputs of test-cases fixtures (see rest-projection.mts). */
import { isDeepStrictEqual } from "node:util";
import { REST_BATCH_UNAVAILABLE } from "../../src/github/rest-batch-unavailable.mts";
import { pollCommandFields } from "../../src/github/poll-summary-command.mts";
import { isCurrentSummaryReady } from "../../src/github/poll-summary-readiness.mts";
import { routePollSummary } from "../../src/github/poll-summary-route.mts";
import { runWithGithubTransport } from "../../src/github/transport.mts";

/** Raw summary keys that the REST summary reader never sets from GraphQL-only evidence. */
export function projectRawSummaryToRest(raw: Record<string, unknown>): Record<string, unknown> {
  const {
    isInMergeQueue: _isInMergeQueue,
    mergeQueueAdditions: _additions,
    mergeQueueRemovals: _removals,
    viewerCanUpdate: _viewerCanUpdate,
    lifecycleEvents: _lifecycleEvents,
    ...rest
  } = raw;
  return {
    ...rest,
    reviewDecision: null,
    mergeQueueEntry: null,
    transport: "rest",
    transportUnavailable: [...REST_BATCH_UNAVAILABLE],
  };
}

/** The routing inputs a precomputed aggregate row implies, as each transport would read them. */
function rowRaw(row, transport: "graphql" | "rest") {
  const raw = {
    number: row.pr,
    state: row.state,
    mergeable: row.mergeable,
    mergeStateStatus: row.mergeStateStatus,
    isDraft: row.isDraft === true,
    autoMergeRequest: row.autoMergeRequest ?? null,
    headRefOid: row.headRefOid,
    baseRefName: row.baseRefName,
    mergeQueueEntry: null,
    stack: row.stack
      ? { number: row.stack.number, size: row.stack.size, baseRefName: row.stack.baseRefName }
      : null,
  };
  if (transport === "rest") {
    return {
      ...raw,
      reviewDecision: null,
      transport: "rest",
      transportUnavailable: [...REST_BATCH_UNAVAILABLE],
    };
  }
  return {
    ...raw,
    reviewDecision: row.reviewDecision ?? null,
    isInMergeQueue: row.isInMergeQueue === true,
    // A GraphQL row routed to the authorization escalation was read with a denied capability.
    viewerCanUpdate: !row.reasons?.includes("mark-ready-authorization-required"),
  };
}

/**
 * Aggregate rows: fixtures write the projector's output directly, so the REST variant re-derives
 * whatever the REST read would change. GraphQL-only fields (review decision, queue membership,
 * queue removal, viewer capability) are dropped, and the row's inputs are routed through the real
 * `routePollSummary` twice, as GraphQL and as REST read them. A row whose route differs takes the
 * REST route and its command fields; a READY receipt that REST evidence cannot certify is dropped.
 * Rows that route identically keep their written action, including projector overlays.
 */
export async function projectSummaryItemToRest(row, opts) {
  const {
    reviewDecision: _reviewDecision,
    isInMergeQueue: _isInMergeQueue,
    queueRemoval: _queueRemoval,
    ...rest
  } = row;
  const projected = {
    ...rest,
    transport: "rest",
    transportUnavailable: [...REST_BATCH_UNAVAILABLE],
  };
  const checks = row.checks ?? {};
  const review = row.review ?? {};
  const graphqlRaw = rowRaw(row, "graphql");
  const restRaw = rowRaw(row, "rest");
  const graphqlRoute = await runWithGithubTransport("graphql", async () =>
    routePollSummary(graphqlRaw, checks, review, opts),
  );
  const restRoute = routePollSummary(restRaw, checks, review, opts);
  const queued = opts.stackPrNumber !== undefined;
  if (
    projected.readyReceipt &&
    // Queued progress is not modeled: a row's summarized checks already stand for the source
    // commit, so only REST-specific evidence gaps can withdraw the receipt.
    isCurrentSummaryReady(graphqlRaw, checks, review) &&
    !isCurrentSummaryReady(restRaw, checks, review)
  )
    delete projected.readyReceipt;
  if (isDeepStrictEqual(graphqlRoute, restRoute)) return projected;
  const { pollCommand: _pollCommand, pollProbe: _pollProbe, ...rerouted } = projected;
  const { action } = restRoute;
  const withCommand =
    (queued && row.state === "OPEN") ||
    (!["wait", "cancel"].includes(action) && !(queued && row.stack && action === "merge"));
  return {
    ...rerouted,
    ...restRoute,
    ...(withCommand && pollCommandFields(row.repo, row.pr, row.isDraft === true, opts)),
  };
}
