export const empty = { pageInfo: { hasPreviousPage: false, startCursor: null }, nodes: [] };
const limit = (remaining: number) => ({ cost: 1, limit: 5000, remaining, used: 1, resetAt: 0 });

export function viewerResponse(
  nodes: unknown[],
  login: string | null = "Me",
  rateLimit = limit(4000),
) {
  return {
    data: {
      viewer: login === null ? null : { login },
      repository: { viewerPermission: "WRITE", viewerCanAdminister: false },
      nodes,
    },
    rateLimit,
  };
}

export const thread = (id: string, comments: unknown[], extra: Record<string, unknown> = {}) => ({
  id,
  isResolved: false,
  isOutdated: false,
  path: "a.ts",
  line: 1,
  comments: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: comments },
  ...extra,
});
export const note = (id: string, login: string | null) => ({
  id,
  isMinimized: false,
  url: "u",
  author: login === null ? null : { login },
  body: "b",
  path: "a.ts",
  line: 1,
  startLine: null,
});
