import type { RawSummaryPr } from "../../src/github/poll-summary-raw.mts";

/** Compact PR reads for the summary review tests. */
export const bot = { login: "noise-bot", __typename: "Bot" };
export const page = { hasPreviousPage: false };

export function raw(parts: {
  comments?: Array<Record<string, unknown>>;
  reviews?: Array<Record<string, unknown>>;
  threads?: Array<Record<string, unknown>>;
}): RawSummaryPr {
  const nodes = <T,>(list: T[] | undefined) => ({
    totalCount: list?.length ?? 0,
    pageInfo: page,
    nodes: list ?? [],
  });
  return {
    comments: nodes(parts.comments),
    reviews: nodes(parts.reviews),
    reviewThreads: nodes(parts.threads),
  } as unknown as RawSummaryPr;
}

export const comment = (id: string, body: string, extra: Record<string, unknown> = {}) => ({
  id,
  body,
  isMinimized: false,
  viewerCanMinimize: true,
  url: `https://example.test/${id}`,
  author: bot,
  ...extra,
});
export const thread = (id: string, body: string, extra: Record<string, unknown> = {}) => ({
  id,
  isResolved: false,
  isOutdated: false,
  viewerCanReply: true,
  viewerCanResolve: true,
  path: "src/a.mts",
  line: 3,
  comments: {
    totalCount: 1,
    pageInfo: page,
    nodes: [{ id: `${id}-root`, body, author: bot, url: `https://example.test/${id}` }],
  },
  ...extra,
});
