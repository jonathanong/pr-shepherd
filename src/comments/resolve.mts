import { graphql, getPrHeadSha, type RepoInfo } from "../github/client.mts";
import type { ResolveOptions } from "../types.mts";
import { loadConfig } from "../config/load.mts";

export interface ResolveResult {
  resolvedThreads: string[];
  minimizedComments: string[];
  dismissedReviews: string[];
  errors: string[];
}

export async function applyResolveOptions(
  pr: number,
  repo: RepoInfo,
  opts: ResolveOptions,
): Promise<ResolveResult> {
  if ((opts.dismissReviewIds?.length ?? 0) > 0 && !opts.dismissMessage) {
    throw new Error("--message is required when dismissing reviews");
  }

  if (opts.requireSha) {
    // Verify GitHub received the commit before resolving — prevents auto-merge
    // before reviewers see the fix.
    await waitForSha(pr, repo, opts.requireSha);
  }

  const result: ResolveResult = {
    resolvedThreads: [],
    minimizedComments: [],
    dismissedReviews: [],
    errors: [],
  };

  await bulkApply(
    opts.resolveThreadIds ?? [],
    opts.minimizeCommentIds ?? [],
    opts.dismissReviewIds ?? [],
    opts.dismissMessage ?? "",
    result,
  );

  return result;
}

export async function autoResolveOutdated(
  threadIds: string[],
): Promise<{ resolved: string[]; errors: string[] }> {
  const result: ResolveResult = {
    resolvedThreads: [],
    minimizedComments: [],
    dismissedReviews: [],
    errors: [],
  };
  await bulkApply(threadIds, [], [], "", result);
  return { resolved: result.resolvedThreads, errors: result.errors };
}

// Chunk at 50 so a single oversized list never fails the entire call.
const BULK_CHUNK_SIZE = 50;

function buildBulkMutation(
  resolveIds: string[],
  minimizeIds: string[],
  dismissIds: string[],
  dismissMessage: string,
): string {
  const ops: string[] = [];

  for (let i = 0; i < resolveIds.length; i++) {
    ops.push(
      `  r${i}: resolveReviewThread(input: { threadId: ${JSON.stringify(resolveIds[i])} }) { thread { isResolved } }`,
    );
  }

  for (let i = 0; i < minimizeIds.length; i++) {
    ops.push(
      `  m${i}: minimizeComment(input: { subjectId: ${JSON.stringify(minimizeIds[i])}, classifier: RESOLVED }) { minimizedComment { isMinimized } }`,
    );
  }

  for (let i = 0; i < dismissIds.length; i++) {
    ops.push(
      `  d${i}: dismissPullRequestReview(input: { pullRequestReviewId: ${JSON.stringify(dismissIds[i])}, message: ${JSON.stringify(dismissMessage)} }) { pullRequestReview { state } }`,
    );
  }

  return `mutation BulkApply {\n${ops.join("\n")}\n}`;
}

async function bulkApply(
  resolveIds: string[],
  minimizeIds: string[],
  dismissIds: string[],
  dismissMessage: string,
  result: ResolveResult,
): Promise<void> {
  type Op = { kind: "r"; id: string } | { kind: "m"; id: string } | { kind: "d"; id: string };
  const allOps: Op[] = [
    ...resolveIds.map((id) => ({ kind: "r" as const, id })),
    ...minimizeIds.map((id) => ({ kind: "m" as const, id })),
    ...dismissIds.map((id) => ({ kind: "d" as const, id })),
  ];

  for (let i = 0; i < allOps.length; i += BULK_CHUNK_SIZE) {
    const chunk = allOps.slice(i, i + BULK_CHUNK_SIZE);
    // eslint-disable-next-line no-await-in-loop
    await bulkApplyChunk(
      chunk.filter((o) => o.kind === "r").map((o) => o.id),
      chunk.filter((o) => o.kind === "m").map((o) => o.id),
      chunk.filter((o) => o.kind === "d").map((o) => o.id),
      dismissMessage,
      result,
    );
  }
}

async function bulkApplyChunk(
  resolveIds: string[],
  minimizeIds: string[],
  dismissIds: string[],
  dismissMessage: string,
  result: ResolveResult,
): Promise<void> {
  if (resolveIds.length === 0 && minimizeIds.length === 0 && dismissIds.length === 0) return;

  const doc = buildBulkMutation(resolveIds, minimizeIds, dismissIds, dismissMessage);

  let data: Record<string, unknown>;
  try {
    const resp = await graphql<Record<string, unknown>>(doc, {});
    data = resp.data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    for (const id of resolveIds) result.errors.push(`${id}: ${msg}`);
    for (const id of minimizeIds) result.errors.push(`${id}: ${msg}`);
    for (const id of dismissIds) result.errors.push(`${id}: ${msg}`);
    return;
  }

  for (let i = 0; i < resolveIds.length; i++) {
    const r = data[`r${i}`] as { thread?: { isResolved?: boolean } } | null | undefined;
    if (r?.thread?.isResolved === true) result.resolvedThreads.push(resolveIds[i]!);
    else result.errors.push(`${resolveIds[i]}: resolve returned null or thread not resolved`);
  }

  for (let i = 0; i < minimizeIds.length; i++) {
    const m = data[`m${i}`] as { minimizedComment?: { isMinimized?: boolean } } | null | undefined;
    if (m?.minimizedComment?.isMinimized === true) result.minimizedComments.push(minimizeIds[i]!);
    else result.errors.push(`${minimizeIds[i]}: minimize returned null or comment not minimized`);
  }

  for (let i = 0; i < dismissIds.length; i++) {
    const d = data[`d${i}`] as { pullRequestReview?: { state?: string } } | null | undefined;
    if (d?.pullRequestReview != null) result.dismissedReviews.push(dismissIds[i]!);
    else result.errors.push(`${dismissIds[i]}: dismiss returned null`);
  }
}

async function waitForSha(pr: number, repo: RepoInfo, expectedSha: string): Promise<void> {
  const { intervalMs: SHA_POLL_INTERVAL_MS, maxAttempts: SHA_POLL_MAX_ATTEMPTS } =
    loadConfig().resolve.shaPoll;
  for (let attempt = 0; attempt < SHA_POLL_MAX_ATTEMPTS; attempt++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const currentSha = await getPrHeadSha(pr, repo.owner, repo.name);
      if (currentSha === expectedSha) return;
    } catch (err) {
      if (attempt === SHA_POLL_MAX_ATTEMPTS - 1) throw err;
    }

    if (attempt < SHA_POLL_MAX_ATTEMPTS - 1) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(SHA_POLL_INTERVAL_MS);
    }
  }

  throw new Error(
    `Timeout: GitHub PR #${pr} head SHA has not updated to ${expectedSha} after ${
      ((SHA_POLL_MAX_ATTEMPTS - 1) * SHA_POLL_INTERVAL_MS) / 1000
    }s. Push may still be in transit — retry shortly.`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
