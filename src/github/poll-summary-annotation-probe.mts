import { graphqlWithRateLimit, type RepoInfo } from "./client.mts";
import { isCurrentSummaryReady } from "./poll-summary-readiness.mts";
import { summarizePollSummaryChecks } from "./poll-summary-checks.mts";
import { fingerprintRawSummaryPr } from "./poll-summary-fingerprint.mts";
import { POLL_SUMMARY_ANNOTATION_PROBE_QUERY } from "./queries.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

const PROBE_UNAVAILABLE = Symbol.for("prShepherd.annotationProbeUnavailable");

interface ProbeNode {
  __typename: string;
  id?: string;
  annotations?: { totalCount: number };
}

interface ProbeContexts {
  pageInfo?: { hasPreviousPage: boolean; startCursor: string | null };
  nodes: ProbeNode[];
}

/**
 * True when a ready layer's annotation probe failed or stopped short of every
 * check page. Callers must not store or compare a fingerprint of that snapshot:
 * it is missing annotation totals a later successful probe would include.
 */
export function annotationProbeUnavailable(pr: RawSummaryPr): boolean {
  return Boolean((pr as { [PROBE_UNAVAILABLE]?: true })[PROBE_UNAVAILABLE]);
}

/** Stored hash when the probe missed, so a later complete probe can still match. */
export function readyFingerprint(raw: RawSummaryPr, stored: string | null): string | null {
  if (annotationProbeUnavailable(raw)) return stored;
  return fingerprintRawSummaryPr(raw);
}

/**
 * Annotation totals are omitted from the always-on summary. A layer that
 * otherwise looks ready loads them once so a READY receipt still changes when
 * a check gains an annotation.
 */
export async function hydrateReadyAnnotationProbe(
  pr: RawSummaryPr,
  repo: RepoInfo,
  review: { actionable?: number; incomplete?: true },
): Promise<void> {
  const checks = summarizePollSummaryChecks(pr);
  if (!isCurrentSummaryReady(pr, checks, review)) return;
  if (!(await hydrateCommitAnnotations(pr, repo))) {
    (pr as { [PROBE_UNAVAILABLE]?: true })[PROBE_UNAVAILABLE] = true;
  }
}

async function hydrateCommitAnnotations(pr: RawSummaryPr, repo: RepoInfo): Promise<boolean> {
  const commit = pr.commits.nodes[0]?.commit;
  const nodes = commit?.statusCheckRollup?.contexts.nodes;
  if (!commit || !nodes?.some((node) => node.__typename === "CheckRun" && node.id)) return true;
  const pages = await collectProbePages(commit.oid, repo);
  if (!pages) return false;
  const probed = new Map(
    pages.flatMap((node) =>
      node.__typename === "CheckRun" && node.id ? [[node.id, node.annotations]] : [],
    ),
  );
  for (const node of nodes) {
    if (node.__typename !== "CheckRun" || !node.id) continue;
    const annotations = probed.get(node.id);
    if (annotations) node.annotations = annotations;
  }
  return true;
}

/** Every check page, oldest last. Null when a page cannot be trusted. */
async function collectProbePages(oid: string, repo: RepoInfo): Promise<ProbeNode[] | null> {
  const pages: ProbeNode[] = [];
  let before: string | null = null;
  const seen = new Set<string>();
  for (;;) {
    const contexts = await fetchProbePage(oid, repo, before);
    if (!contexts) return null;
    pages.push(...contexts.nodes);
    const pageInfo = contexts.pageInfo;
    if (!pageInfo?.hasPreviousPage) return pages;
    const cursor = pageInfo.startCursor;
    if (!cursor || seen.has(cursor)) return null;
    seen.add(cursor);
    before = cursor;
  }
}

async function fetchProbePage(
  oid: string,
  repo: RepoInfo,
  before: string | null,
): Promise<ProbeContexts | null> {
  try {
    const { data } = await graphqlWithRateLimit<{
      repository: {
        object: {
          __typename: string;
          oid?: string;
          statusCheckRollup?: { contexts: ProbeContexts } | null;
        } | null;
      } | null;
    }>(POLL_SUMMARY_ANNOTATION_PROBE_QUERY, {
      owner: repo.owner,
      repo: repo.name,
      oid,
      before,
    });
    const object = data.repository?.object;
    if (object?.__typename !== "Commit" || object.oid !== oid) return null;
    return object.statusCheckRollup?.contexts ?? null;
  } catch {
    return null;
  }
}
