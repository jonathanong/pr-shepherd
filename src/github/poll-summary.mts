import { EXIT, ShepherdError } from "../exit-codes.mts";
import type {
  PollSummaryCommandOptions,
  PollSummaryItem,
  PollSummarySelection,
  PollSummaryStackAncestry,
} from "../types.mts";
import { graphqlWithRateLimit, type RepoInfo } from "./client.mts";
import {
  GitHubRequestError,
  isRetryableGraphQlResourceLimit,
  missingRepositoryError,
} from "./errors.mts";
import { hydratePollSummaryChecks } from "./poll-summary-check-hydration.mts";
import { summarizePollSummaryPr } from "./poll-summary-projector.mts";
import { trunkRequiredContexts } from "./poll-summary-unreported.mts";
import type { RawExplicitResponse, RawSummaryPr } from "./poll-summary-raw.mts";
import { POLL_STACK_SUMMARY_QUERY, POLL_SUMMARY_FRAGMENT } from "./queries.mts";
import {
  MAX_STACK_ENTRIES_PER_PAGE,
  readStack,
  readStackTopology,
  stackAncestryGaps,
  type StackRead,
} from "./stack-read.mts";

const MAX_EXPLICIT_PRS_PER_QUERY = 50;
export interface FetchedPollSummary {
  selection: PollSummarySelection;
  prs: PollSummaryItem[];
  stackAncestry?: PollSummaryStackAncestry[];
}

export async function fetchPollSummary(
  opts: PollSummaryCommandOptions,
  repo: RepoInfo,
): Promise<FetchedPollSummary> {
  if (opts.stackPrNumber !== undefined) return fetchStackSummary(opts, repo);
  const requested = deduplicate(opts.prNumbers ?? []);
  if (requested.length === 0) {
    throw new ShepherdError("Aggregate poll requires at least two PRs or --stack <PR>", EXIT.USAGE);
  }
  const raw: RawSummaryPr[] = [];
  let viewerCanAdminister = false;
  for (let offset = 0; offset < requested.length; offset += MAX_EXPLICIT_PRS_PER_QUERY) {
    const chunk = requested.slice(offset, offset + MAX_EXPLICIT_PRS_PER_QUERY);
    const fetched = await fetchExplicitChunk(chunk, repo);
    viewerCanAdminister = fetched.viewerCanAdminister;
    raw.push(...fetched.prs);
  }
  return {
    selection: { kind: "prs", requested },
    prs: await Promise.all(
      raw.map((pr) => summarizePollSummaryPr(pr, repo, opts, viewerCanAdminister)),
    ),
  };
}

/** Fresh, read-only snapshot used to bind a one-PR READY receipt to stack routing. */
export async function fetchRawSummaryPr(pr: number, repo: RepoInfo): Promise<RawSummaryPr> {
  const fetched = await fetchExplicitChunk([pr], repo);
  return fetched.prs[0]!;
}

async function fetchExplicitChunk(
  prs: number[],
  repo: RepoInfo,
): Promise<{ prs: RawSummaryPr[]; viewerCanAdminister: boolean }> {
  const declarations = prs.map((_, index) => `$pr${index}: Int!`).join(", ");
  const aliases = prs
    .map((_, index) => `pr${index}: pullRequest(number: $pr${index}) { ...PollSummaryPr }`)
    .join("\n");
  const query = `${POLL_SUMMARY_FRAGMENT}\nquery PollSummary($owner: String!, $repo: String!, ${declarations}) {\n  _shepherdRateLimit: rateLimit { cost limit nodeCount remaining resetAt used }\n  repository(owner: $owner, name: $repo) {\n    viewerCanAdminister\n    ${aliases}\n  }\n}`;
  const variables = Object.fromEntries(prs.map((pr, index) => [`pr${index}`, pr]));
  const result = await graphqlWithRateLimit<RawExplicitResponse>(query, {
    owner: repo.owner,
    repo: repo.name,
    ...variables,
  });
  if (!result.data.repository) throw missingRepositoryError(repo);
  const rawPrs = prs.map((pr, index) => {
    const raw = result.data.repository![`pr${index}`] as RawSummaryPr | null;
    if (!raw) throw new ShepherdError(`PR #${pr} not found`, EXIT.UNAVAILABLE);
    return raw;
  });
  for (const raw of rawPrs) await hydratePollSummaryChecks(raw, repo);
  return { prs: rawPrs, viewerCanAdminister: result.data.repository.viewerCanAdminister };
}

/**
 * Read the stack's topology first so the hydrated page requests only as many
 * entries as the stack holds: GitHub prices `first`, not the nodes returned.
 */
async function fetchStackSummary(
  opts: PollSummaryCommandOptions,
  repo: RepoInfo,
): Promise<FetchedPollSummary> {
  const anchor = opts.stackPrNumber!;
  const topology = await readStackTopology(anchor, repo);
  const { stackNumber, stackSize, viewerLogin, viewerCanAdminister, ordered } =
    await readStackSummary(anchor, repo, topology.stackSize);
  for (const pr of ordered) await hydratePollSummaryChecks(pr, repo);
  const stackAncestry = stackAncestryGaps(ordered);
  const required = trunkRequiredContexts(ordered);
  return {
    selection: { kind: "stack", anchor, stackNumber, stackSize },
    prs: await Promise.all(
      ordered.map((pr) =>
        summarizePollSummaryPr(pr, repo, opts, viewerCanAdminister, required, viewerLogin),
      ),
    ),
    ...(stackAncestry.length > 0 && { stackAncestry }),
  };
}

/**
 * A wide check matrix can blow GitHub's per-query resource limit on the full
 * page. Halve `first` down to one entry and let `readStack` follow `after`.
 * The shared summary fragment stays intact: one layer is the same shape as an
 * explicit summary, and check hydration still completes windows past 100.
 */
async function readStackSummary(
  anchor: number,
  repo: RepoInfo,
  stackSize: number,
): Promise<StackRead<RawSummaryPr>> {
  let first = Math.min(stackSize, MAX_STACK_ENTRIES_PER_PAGE);
  for (;;) {
    try {
      return await readStack<RawSummaryPr>(POLL_STACK_SUMMARY_QUERY, anchor, repo, { first });
    } catch (err) {
      if (
        !(err instanceof GitHubRequestError) ||
        !isRetryableGraphQlResourceLimit(err.graphqlErrors) ||
        first <= 1
      ) {
        throw err;
      }
      first = Math.floor(first / 2);
    }
  }
}

function deduplicate(values: number[]): number[] {
  return [...new Set(values)];
}
