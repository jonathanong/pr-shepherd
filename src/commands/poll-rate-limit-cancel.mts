import type {
  IterateResult,
  MergeStateStatus,
  MergeableState,
  PollSummaryItem,
  PollSummaryResult,
} from "../types.mts";

export interface RateLimitPullTarget {
  owner: string;
  repo: string;
  pr: number;
}

export interface RateLimitProbePull {
  pr: number;
  state: "MERGED" | "CLOSED";
  title: string;
  url: string;
  draft: boolean;
  mergeable: MergeableState;
  mergeStateStatus: MergeStateStatus;
  baseRefName: string;
  headRefName: string;
  headRefOid: string;
}

export function onePrRateLimitTargets(
  explicit: { owner: string; name: string } | undefined,
  pr: number | undefined,
  repoSlug: string | undefined,
): RateLimitPullTarget[] {
  if (pr === undefined) return [];
  const [slugOwner, slugName] = repoSlug?.split("/") ?? [];
  const owner = explicit?.owner ?? slugOwner;
  const repo = explicit?.name ?? slugName;
  if (!owner || !repo) return [];
  return [{ owner, repo, pr }];
}

/** Same fields as the merged/closed iterate cancel path, filled from the REST pull. */
export function onePrCancelFromPulls(
  explicit: { owner: string; name: string } | undefined,
  repoSlug: string | undefined,
  pulls: RateLimitProbePull[],
): IterateResult | undefined {
  const pull = pulls[0];
  const slug = explicit ? `${explicit.owner}/${explicit.name}` : repoSlug;
  if (!pull || !slug) return undefined;
  const state = pull.state;
  return {
    pr: pull.pr,
    repo: slug,
    status: state,
    state,
    mergeStateStatus: pull.mergeStateStatus,
    mergeStatus: "UNKNOWN",
    reviewDecision: null,
    blockingBotReviewInProgress: false,
    isDraft: pull.draft,
    shouldCancel: true,
    remainingSeconds: 0,
    summary: { passing: 0, skipped: 0, filtered: 0, inProgress: 0, superseded: 0 },
    baseBranch: pull.baseRefName,
    branchProtection: null,
    checks: [],
    inProgressChecks: [],
    action: "cancel",
    reason: state === "MERGED" ? "merged" : "closed",
    log: `CANCEL: PR #${pull.pr} is ${state.toLowerCase()} — stopping`,
  };
}

export function aggregateRateLimitTargets(
  last: PollSummaryResult | undefined,
  repo: { owner: string; name: string } | undefined,
  prNumbers: number[] | undefined,
): RateLimitPullTarget[] {
  if (last) {
    return last.prs.flatMap((item) => {
      if (item.state !== "OPEN") return [];
      const [owner, name] = item.repo.split("/");
      if (!owner || !name) return [];
      return [{ owner, repo: name, pr: item.pr }];
    });
  }
  if (!repo || !prNumbers?.length) return [];
  return prNumbers.map((pr) => ({ owner: repo.owner, repo: repo.name, pr }));
}

export function aggregateCancelFromPulls(
  last: PollSummaryResult | undefined,
  repo: { owner: string; name: string } | undefined,
  pulls: RateLimitProbePull[],
): PollSummaryResult | undefined {
  if (last) {
    const byPr = new Map(pulls.map((pull) => [pull.pr, pull]));
    const prs = last.prs.map((item) => applyProbe(item, byPr.get(item.pr)));
    if (prs.some((item) => item.state !== "MERGED" && item.state !== "CLOSED")) return undefined;
    return { ...last, prs, reason: "all_terminal" };
  }
  if (!repo) return undefined;
  const slug = `${repo.owner}/${repo.name}`;
  const prs = pulls.map((pull) => syntheticItem(slug, pull));
  return {
    mode: "summary",
    repo: slug,
    selection: { kind: "prs", requested: pulls.map((pull) => pull.pr) },
    reason: "all_terminal",
    prs,
  };
}

function applyProbe(item: PollSummaryItem, pull: RateLimitProbePull | undefined): PollSummaryItem {
  if (!pull) return item;
  return {
    ...item,
    action: "cancel",
    state: pull.state,
    reasons: [pull.state === "MERGED" ? "merged" : "closed"],
  };
}

function syntheticItem(repo: string, pull: RateLimitProbePull): PollSummaryItem {
  return {
    pr: pull.pr,
    repo,
    title: pull.title || `PR ${pull.pr}`,
    url: pull.url || `https://github.com/${repo}/pull/${pull.pr}`,
    action: "cancel",
    reasons: [pull.state === "MERGED" ? "merged" : "closed"],
    state: pull.state,
    mergeable: pull.mergeable,
    mergeStateStatus: pull.mergeStateStatus,
    headRefName: pull.headRefName,
    headRefOid: pull.headRefOid,
    baseRefName: pull.baseRefName,
    ...(pull.draft ? { isDraft: true } : {}),
  };
}
