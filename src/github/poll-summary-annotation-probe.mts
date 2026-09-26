import { graphqlWithRateLimit, type RepoInfo } from "./client.mts";
import { isCurrentSummaryReady } from "./poll-summary-readiness.mts";
import { summarizePollSummaryChecks } from "./poll-summary-checks.mts";
import { POLL_SUMMARY_ANNOTATION_PROBE_QUERY } from "./queries.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

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
  await hydrateCommitAnnotations(pr, repo);
}

async function hydrateCommitAnnotations(pr: RawSummaryPr, repo: RepoInfo): Promise<void> {
  const commit = pr.commits.nodes[0]?.commit;
  const nodes = commit?.statusCheckRollup?.contexts.nodes;
  if (!commit || !nodes?.some((node) => node.__typename === "CheckRun" && node.id)) return;
  try {
    const { data } = await graphqlWithRateLimit<{
      repository: {
        object: {
          __typename: string;
          oid?: string;
          statusCheckRollup?: {
            contexts: {
              nodes: Array<{
                __typename: string;
                id?: string;
                annotations?: { totalCount: number };
              }>;
            };
          } | null;
        } | null;
      } | null;
    }>(POLL_SUMMARY_ANNOTATION_PROBE_QUERY, {
      owner: repo.owner,
      repo: repo.name,
      oid: commit.oid,
    });
    const object = data.repository?.object;
    if (object?.__typename !== "Commit" || object.oid !== commit.oid) return;
    const probed = new Map(
      (object.statusCheckRollup?.contexts.nodes ?? []).flatMap((node) =>
        node.__typename === "CheckRun" && node.id ? [[node.id, node.annotations]] : [],
      ),
    );
    for (const node of nodes) {
      if (node.__typename !== "CheckRun" || !node.id) continue;
      const annotations = probed.get(node.id);
      if (annotations) node.annotations = annotations;
    }
  } catch {
    // A missing probe leaves the receipt fingerprint without annotation totals.
  }
}
