import { EXIT, ShepherdError } from "../exit-codes.mts";
import type {
  PollSummaryCommandOptions,
  PollSummaryItem,
  PollSummarySelection,
  PollSummaryStackAncestry,
} from "../types.mts";
import { graphqlWithRateLimit, type RepoInfo } from "./client.mts";
import { GitHubRequestError } from "./errors.mts";
import { summarizePollSummaryPr } from "./poll-summary-projector.mts";
import type { RawExplicitResponse, RawStackResponse, RawSummaryPr } from "./poll-summary-raw.mts";
import { POLL_STACK_SUMMARY_QUERY, POLL_SUMMARY_FRAGMENT } from "./queries.mts";

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
  if (!result.data.repository) throw missingRepository(repo);
  const rawPrs = prs.map((pr, index) => {
    const raw = result.data.repository![`pr${index}`] as RawSummaryPr | null;
    if (!raw) throw new ShepherdError(`PR #${pr} not found`, EXIT.UNAVAILABLE);
    return raw;
  });
  return { prs: rawPrs, viewerCanAdminister: result.data.repository.viewerCanAdminister };
}

async function fetchStackSummary(
  opts: PollSummaryCommandOptions,
  repo: RepoInfo,
): Promise<FetchedPollSummary> {
  const anchor = opts.stackPrNumber!;
  let after: string | null = null;
  let stackId: string | null = null;
  let stackNumber = 0;
  let stackSize = 0;
  let viewerCanAdminister = false;
  const entries: Array<{ position: number; pullRequest: RawSummaryPr }> = [];
  do {
    const response = (await graphqlWithRateLimit<RawStackResponse>(POLL_STACK_SUMMARY_QUERY, {
      owner: repo.owner,
      repo: repo.name,
      anchor,
      after,
    })) as { data: RawStackResponse };
    const repository: RawStackResponse["repository"] = response.data.repository;
    if (!repository) throw missingRepository(repo);
    viewerCanAdminister = repository.viewerCanAdminister;
    if (!repository.pullRequest) {
      throw new ShepherdError(`PR #${anchor} not found`, EXIT.UNAVAILABLE);
    }
    const stack: NonNullable<RawStackResponse["repository"]>["pullRequest"] extends infer Pr
      ? Pr extends { stack: infer Stack }
        ? Stack
        : never
      : never = repository.pullRequest.stack;
    if (!stack) {
      throw new ShepherdError(
        `PR #${anchor} is not part of a native GitHub stack`,
        EXIT.UNAVAILABLE,
      );
    }
    if (stackId !== null && stack.id !== stackId) {
      throw new ShepherdError(
        "GitHub stack membership changed while it was being fetched; retry",
        EXIT.TEMPFAIL,
      );
    }
    stackId = stack.id;
    stackNumber = stack.number;
    stackSize = stack.size;
    for (const entry of stack.entries.nodes) {
      if (!entry.pullRequest) {
        throw new ShepherdError(
          "GitHub returned an incomplete pull-request stack entry",
          EXIT.TEMPFAIL,
        );
      }
      entries.push({ position: entry.position, pullRequest: entry.pullRequest });
    }
    const pageInfo: { hasNextPage: boolean; endCursor: string | null } = stack.entries.pageInfo;
    if (pageInfo.hasNextPage && !pageInfo.endCursor) {
      throw new ShepherdError(
        "GitHub stack pagination did not include an end cursor",
        EXIT.TEMPFAIL,
      );
    }
    after = pageInfo.hasNextPage ? pageInfo.endCursor : null;
  } while (after !== null);

  const unique = new Map<number, { position: number; pullRequest: RawSummaryPr }>();
  for (const entry of entries) unique.set(entry.pullRequest.number, entry);
  if (!unique.has(anchor) || unique.size !== stackSize) {
    throw new ShepherdError(
      `GitHub returned incomplete stack membership (${unique.size} of ${stackSize} entries)`,
      EXIT.TEMPFAIL,
    );
  }
  const ordered = [...unique.values()].sort((left, right) => left.position - right.position);
  const stackAncestry: NonNullable<FetchedPollSummary["stackAncestry"]> = [];
  for (let index = 1; index < ordered.length; index++) {
    const parent = ordered[index - 1].pullRequest;
    const child = ordered[index].pullRequest;
    if (parent.state !== "OPEN" || child.state !== "OPEN") continue;
    if (child.baseRefName === parent.headRefName && child.baseRefOid === parent.headRefOid) {
      continue;
    }
    stackAncestry.push({
      parentPr: parent.number,
      parentHeadRefName: parent.headRefName,
      parentHeadRefOid: parent.headRefOid,
      childPr: child.number,
      childBaseRefName: child.baseRefName,
      childBaseRefOid: child.baseRefOid,
    });
  }
  return {
    selection: { kind: "stack", anchor, stackNumber, stackSize },
    prs: await Promise.all(
      ordered.map((entry) =>
        summarizePollSummaryPr(entry.pullRequest, repo, opts, viewerCanAdminister),
      ),
    ),
    ...(stackAncestry.length > 0 && { stackAncestry }),
  };
}

function deduplicate(values: number[]): number[] {
  return [...new Set(values)];
}

function missingRepository(repo: RepoInfo): GitHubRequestError {
  return new GitHubRequestError(
    `GitHub GraphQL response did not include repository ${repo.owner}/${repo.name} (not found or access denied)`,
    { status: 200 },
  );
}
