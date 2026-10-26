import { readRestStackSummary } from "./rest-stack-summary.mts";
import { githubOperation, getGithubTransport, runWithGithubTransport } from "./transport.mts";
import { readRestExplicitSummary } from "./rest-explicit-summary-read.mts";
import { withRestConditionalScope } from "./rest-conditional-scope.mts";
import { EXIT, ShepherdError } from "../exit-codes.mts";
import type {
  PollSummaryCommandOptions,
  PollSummaryItem,
  PollSummarySelection,
  PollSummaryStackAncestry,
} from "../types.mts";
import { graphqlWithRateLimit, type RepoInfo } from "./client.mts";
import { missingRepositoryError } from "./errors.mts";
import { hydratePollSummaryChecks } from "./poll-summary-check-hydration.mts";
import { refreshUnknownSummaryMergeability } from "./poll-summary-mergeability.mts";
import { summarizePollSummaryPr } from "./poll-summary-projector.mts";
import {
  hydrateRowsIsolated,
  summarizeRowsIsolated,
  type ExplicitChunk,
} from "./poll-summary-row-error.mts";
import { trunkRequiredContexts } from "./poll-summary-unreported.mts";
import { loadStackSizeHint, storeStackSizeHint } from "./stack-size-hint.mts";
import type { RawExplicitResponse, RawSummaryPr } from "./poll-summary-raw.mts";
import { POLL_SUMMARY_FRAGMENT } from "./queries.mts";
import { stackAncestryGaps, type StackRead } from "./stack-read.mts";
import { readGraphqlStackSummary } from "./poll-summary-stack-page.mts";
import { stackHandoffSource } from "./stack-handoff.mts";
import type { StackHandoffSource } from "./stack-handoff-page.mts";

const MAX_EXPLICIT_PRS_PER_QUERY = 50;
export interface FetchedPollSummary {
  selection: PollSummarySelection;
  prs: PollSummaryItem[];
  stackAncestry?: PollSummaryStackAncestry[];
  allowedMergeMethods?: import("../config/merge-method.mts").MergeMethod[];
  /** GraphQL stack reads only: the raw layers a routing tick hands to its one-PR sessions. */
  handoffSource?: StackHandoffSource;
}

async function fetchSelectedPollSummary(
  opts: PollSummaryCommandOptions,
  repo: RepoInfo,
): Promise<FetchedPollSummary> {
  if (opts.stackPrNumber !== undefined) return fetchStackSummary(opts, repo);
  const requested = [...new Set(opts.prNumbers ?? [])];
  if (requested.length === 0) {
    throw new ShepherdError("Aggregate poll requires at least two PRs or a stack PR", EXIT.USAGE);
  }
  const raw: RawSummaryPr[] = [];
  const failures = new Map<number, unknown>();
  let viewerCanAdminister: boolean | undefined;
  for (let offset = 0; offset < requested.length; offset += MAX_EXPLICIT_PRS_PER_QUERY) {
    const chunk = requested.slice(offset, offset + MAX_EXPLICIT_PRS_PER_QUERY);
    const fetched = await fetchExplicitChunk(chunk, repo);
    viewerCanAdminister = fetched.viewerCanAdminister;
    raw.push(...fetched.prs);
    for (const [pr, error] of fetched.failures ?? []) failures.set(pr, error);
  }
  return {
    selection: { kind: "prs", requested },
    // One explicit PR's failed read becomes a row; stack selections stay fail-closed.
    prs: await summarizeRowsIsolated(raw, failures, repo, opts, (pr) =>
      summarizePollSummaryPr(pr, repo, opts, viewerCanAdminister, undefined, null, true),
    ),
  };
}

/** Fresh, read-only snapshot used to bind a one-PR READY receipt to stack routing. */
export async function fetchRawSummaryPr(pr: number, repo: RepoInfo): Promise<RawSummaryPr> {
  const fetched = await fetchExplicitChunk([pr], repo);
  if (fetched.failures?.has(pr)) throw fetched.failures.get(pr);
  return fetched.prs[0]!;
}

async function fetchGraphqlExplicitChunk(
  prs: number[],
  repo: RepoInfo,
): Promise<ExplicitChunk & { viewerCanAdminister: boolean }> {
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
  const failures = await hydrateRowsIsolated(rawPrs, repo);
  return { prs: rawPrs, viewerCanAdminister: result.data.repository.viewerCanAdminister, failures };
}

async function fetchExplicitChunk(
  prs: number[],
  repo: RepoInfo,
): Promise<ExplicitChunk & { viewerCanAdminister?: boolean }> {
  return githubOperation(
    "PollSummary",
    () => runWithGithubTransport("graphql", () => fetchGraphqlExplicitChunk(prs, repo)),
    async () => ({
      prs: await withSummaryConditionalScope(repo, prs[0]!, () =>
        readRestExplicitSummary(prs, repo),
      ),
    }),
  );
}

/**
 * Entries on an unsized first summary page. GitHub prices `first`, not the
 * nodes returned, and four layers are the most that still price at 1 point.
 * Larger stacks page on, sized to the entries that remain.
 */
const UNSIZED_STACK_SUMMARY_FIRST = 4;

/**
 * Size the hydrated page to the stack so it requests only as many entries as the
 * stack holds. The size comes from the anchor's last summary; the first summary
 * reads four entries and pages on, which never costs more than reading the
 * topology first. A stack that has since grown pages on, and one that shrank
 * overpays once.
 */
async function fetchStackSummary(
  opts: PollSummaryCommandOptions,
  repo: RepoInfo,
): Promise<FetchedPollSummary> {
  const anchor = opts.stackPrNumber!;
  const stateKey = { owner: repo.owner, repo: repo.name, pr: anchor };
  const graphql = getGithubTransport() !== "rest";
  const hint = graphql ? await loadStackSizeHint(stateKey) : 0;
  const sizeHint = hint || UNSIZED_STACK_SUMMARY_FIRST;
  const read = await readStackSummary(anchor, repo, sizeHint);
  const { stackNumber, stackSize, viewerLogin, viewerCanAdminister, ordered, allowedMergeMethods } =
    read;
  if (graphql && stackSize !== hint) await storeStackSizeHint(stateKey, stackSize);
  for (const pr of ordered) {
    await hydratePollSummaryChecks(pr, repo);
    await refreshUnknownSummaryMergeability(pr, repo);
  }
  const handoffSource = getGithubTransport() === "rest" ? undefined : stackHandoffSource(read);
  const stackAncestry = stackAncestryGaps(ordered);
  const required = await trunkRequiredContexts(ordered, repo);
  return {
    selection: { kind: "stack", anchor, stackNumber, stackSize },
    prs: await Promise.all(
      ordered.map((pr) =>
        summarizePollSummaryPr(pr, repo, opts, viewerCanAdminister, required, viewerLogin, true),
      ),
    ),
    ...(stackAncestry.length > 0 && { stackAncestry }),
    ...(allowedMergeMethods && { allowedMergeMethods }),
    ...(handoffSource && { handoffSource }),
  };
}

async function readStackSummary(
  anchor: number,
  repo: RepoInfo,
  stackSize: number,
): Promise<StackRead<RawSummaryPr>> {
  return githubOperation(
    "PollStackSummary",
    () => readGraphqlStackSummary(anchor, repo, stackSize),
    () => withSummaryConditionalScope(repo, anchor, () => readRestStackSummary(anchor, repo)),
  );
}

/** REST summary reads are conditional under the anchor PR's state: an unchanged body is a free 304. */
function withSummaryConditionalScope<T>(repo: RepoInfo, pr: number, read: () => Promise<T>) {
  return withRestConditionalScope({ owner: repo.owner, repo: repo.name, pr }, read);
}

export function fetchPollSummary(
  opts: PollSummaryCommandOptions,
  repo: RepoInfo,
): Promise<FetchedPollSummary> {
  return githubOperation(
    "PollSummarySelection",
    () => runWithGithubTransport("graphql", () => fetchSelectedPollSummary(opts, repo)),
    () => fetchSelectedPollSummary(opts, repo),
  );
}
