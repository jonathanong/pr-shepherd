// @ts-nocheck
/**
 * Effects of a "no-op agent" on the simulated GitHub state: it pushes nothing and edits no code,
 * but runs every review mutation and `rerun:` command the CLI generated on the previous tick.
 */
import { hashBody } from "../../src/state/seen-comments.mts";
import { addPrShepherdMarker } from "../../src/comments/marker.mts";
import { threadComments, threadTranscriptBody } from "../../src/threads/transcript.mts";

function flagIds(argv: string[] | undefined, flag: string): string[] {
  const index = (argv ?? []).indexOf(flag);
  return index < 0 ? [] : String(argv[index + 1]).split(",");
}

function mapRuns(list, runIds: Set<string>, change) {
  if (!list) return list;
  return list.flatMap((check) => {
    if (!runIds.has(String(check.runId))) return [check];
    const next = change(check);
    return next === null ? [] : [next];
  });
}

/** The agent's reply lands on the thread; `apply review` also records a reply marker. */
function replyTo(thread, seen) {
  const root = threadComments(thread)[0];
  const comments = thread.comments?.length
    ? thread.comments
    : [{ id: `${thread.id}-root`, ...root, url: thread.url ?? "" }];
  const reply = {
    id: `${thread.id}-reply`,
    author: "viewer",
    authorType: "User",
    viewerDidAuthor: true,
    body: addPrShepherdMarker("Acknowledged; no code change needed."),
    url: "",
  };
  const next = { ...thread, comments: [...comments, reply] };
  seen.set(thread.id, {
    ...seen.get(thread.id),
    seenAt: 1,
    id: thread.id,
    bodyHash: hashBody(threadTranscriptBody(next)),
    previousBodyHash: hashBody(threadTranscriptBody(thread)),
  });
  return next;
}

/** Mutates a fixture clone: generated mutations and reruns take effect on GitHub. */
export function applyAgentEffects(fixture, triage, seen: Map<string, Record<string, unknown>>) {
  const batch = fixture.batchData;
  const argvs = [triage.resolveCommand, triage.resolveOnlyCommand].map((c) => c?.argv);
  const ids = (flag: string) => new Set(argvs.flatMap((argv) => flagIds(argv, flag)));
  const resolve = ids("--resolve-thread-ids");
  const reply = ids("--reply-thread-ids");
  const minimize = ids("--minimize-comment-ids");
  const dismiss = ids("--dismiss-review-ids");

  batch.reviewThreads = (batch.reviewThreads ?? []).map((thread) => {
    if (resolve.has(thread.id)) return { ...thread, isResolved: true };
    if (reply.has(thread.id)) return replyTo(thread, seen);
    return thread;
  });
  if (batch.comments) {
    batch.comments = batch.comments.map((c) =>
      minimize.has(c.id) ? { ...c, isMinimized: true } : c,
    );
  }
  // The batch parser drops minimized review summaries and approvals before iterate sees them.
  for (const key of ["reviewSummaries", "approvedReviews"]) {
    if (batch[key]) batch[key] = batch[key].filter((r) => !minimize.has(r.id));
  }
  for (const key of ["changesRequestedReviews", "reviewSummaries"]) {
    if (batch[key]) batch[key] = batch[key].filter((r) => !dismiss.has(r.id));
  }

  const rerunIds = new Set(
    (triage.checks ?? []).flatMap((check) => {
      const match = /gh run rerun (\d+)/.exec(check.rerunCommand ?? "");
      return match ? [match[1]] : [];
    }),
  );
  if (rerunIds.size === 0) return;
  // A rerun puts the run back in progress at attempt + 1; its failed jobs are no longer failing.
  const restart = (c) => ({
    ...c,
    status: "IN_PROGRESS",
    conclusion: null,
    runAttempt: (c.runAttempt ?? 1) + 1,
  });
  if (batch.checks) batch.checks = mapRuns(batch.checks, rerunIds, restart);
  if (fixture.triagedChecks)
    fixture.triagedChecks = mapRuns(fixture.triagedChecks, rerunIds, () => null);
  if (fixture.startupFailureChecks) {
    fixture.startupFailureChecks = mapRuns(fixture.startupFailureChecks, rerunIds, () => null);
  }
}
