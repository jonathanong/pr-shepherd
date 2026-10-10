import { graphqlWithRateLimit, type RepoInfo } from "./client.mts";
import { githubOperation } from "./transport.mts";
import {
  REPLY_EVIDENCE_THREAD_SELECTION,
  threadReplyEvidence,
  type ReplyEvidence,
  type ReplyEvidenceResponse,
} from "./reply-recovery-read.mts";
import { threadTranscriptBodies } from "../threads/transcript.mts";
import { mapPool } from "../util/pool.mts";

/**
 * Reads, in one GraphQL request, what `apply review` with reply IDs otherwise reads three times:
 * the PR head for `--require-sha`, the pre-reply transcripts for seen markers, and the reply
 * recovery evidence for the first mutation batch. Every field is checked exactly as its
 * standalone read checks it; anything missing is left to that read.
 */
export interface ApplyReviewPreflight {
  headSha?: string;
  /** Pre-reply transcripts for threads whose comments fit on the first page. */
  transcripts: Map<string, string>;
  /** Complete recovery evidence per requested thread. */
  evidence: Map<string, ReplyEvidence>;
}

const MAX_IDS = 20;

const QUERY = `query ApplyReviewPreflight($owner: String!, $repo: String!, $pr: Int!, $ids: [ID!]!, $cursor: String) {
  _shepherdRateLimit: rateLimit { cost limit nodeCount remaining resetAt used }
  repository(owner: $owner, name: $repo) { pullRequest(number: $pr) { headRefOid } }
  viewer { login }
  nodes(ids: $ids) { __typename ${REPLY_EVIDENCE_THREAD_SELECTION} }
}`;

interface Response extends ReplyEvidenceResponse {
  repository: { pullRequest: { headRefOid?: string } | null } | null;
  nodes: Array<(ReplyEvidenceResponse["nodes"][number] & { __typename?: string }) | null>;
}

/**
 * GraphQL-only; returns null when the preflight does not apply (REST transport, no reply IDs,
 * more than one transcript batch, or REST thread handles). Request errors propagate.
 */
export function readApplyReviewPreflight(
  pr: number,
  repo: RepoInfo,
  replyIds: readonly string[],
): Promise<ApplyReviewPreflight | null> {
  const ids = [...new Set(replyIds)];
  if (ids.length === 0 || ids.length > MAX_IDS || ids.some((id) => id.startsWith("rest-thread-")))
    return Promise.resolve(null);
  return githubOperation(
    "ApplyReviewPreflight",
    async () => {
      const { data } = await graphqlWithRateLimit<Response>(QUERY, {
        owner: repo.owner,
        repo: repo.name,
        pr,
        ids,
        cursor: null,
      });
      const headSha = data.repository?.pullRequest?.headRefOid;
      const evidence = await mapPool(ids, 4, async (id) => {
        try {
          return [id, await threadReplyEvidence(repo, pr, id, data)] as const;
        } catch {
          return null;
        }
      });
      return {
        ...(typeof headSha === "string" && headSha && { headSha }),
        transcripts: firstPageTranscripts(data, pr, repo, new Set(ids)),
        evidence: new Map(evidence.filter((entry) => entry !== null)),
      };
    },
    async () => null,
  );
}

/** The same acceptance rules as `ReplyThreadTranscripts`, limited to single-page threads. */
function firstPageTranscripts(
  data: Response,
  pr: number,
  repo: RepoInfo,
  requested: Set<string>,
): Map<string, string> {
  const expectedRepo = `${repo.owner}/${repo.name}`.toLowerCase();
  const transcripts = new Map<string, string>();
  for (const node of data.nodes) {
    if (
      node?.__typename !== "PullRequestReviewThread" ||
      !requested.has(node.id) ||
      node.pullRequest?.number !== pr ||
      node.pullRequest.repository.nameWithOwner.toLowerCase() !== expectedRepo ||
      !node.comments ||
      node.comments.pageInfo.hasNextPage ||
      node.comments.nodes.length === 0
    )
      continue;
    transcripts.set(node.id, threadTranscriptBodies(node.comments.nodes.map((c) => c.body)));
  }
  return transcripts;
}
