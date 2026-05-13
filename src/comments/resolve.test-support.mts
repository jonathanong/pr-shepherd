// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock github/client.mts before any imports.
// ---------------------------------------------------------------------------

vi.mock("../github/client.mts", () => ({
  graphqlWithRateLimit: vi.fn(),
  getPrHeadSha: vi.fn(),
}));

import { applyResolveOptions, autoResolveOutdated } from "./resolve.mts";
import { graphqlWithRateLimit, getPrHeadSha } from "../github/client.mts";

const mockGraphql = vi.mocked(graphqlWithRateLimit);
const mockGetPrHeadSha = vi.mocked(getPrHeadSha);

const REPO = { owner: "owner", name: "repo" };

/** Build a mock response with the correct nested shape for each alias type (r/m/d). */
function makeBulkResponse(doc: unknown): { data: Record<string, unknown> } {
  const str = typeof doc === "string" ? doc : "";
  const data: Record<string, unknown> = {};
  for (const [, alias] of str.matchAll(/^\s+([a-z]\d+):/gm)) {
    if (alias!.startsWith("r")) data[alias!] = { thread: { isResolved: true } };
    else if (alias!.startsWith("m")) data[alias!] = { minimizedComment: { isMinimized: true } };
    else if (alias!.startsWith("d")) data[alias!] = { pullRequestReview: { state: "DISMISSED" } };
    else data[alias!] = {};
  }
  return { data };
}

// ---------------------------------------------------------------------------
// applyResolveOptions
// ---------------------------------------------------------------------------

export function registerHooks(): void {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGraphql.mockImplementation(async (doc) => makeBulkResponse(doc));
  });
}

export {
  REPO,
  applyResolveOptions,
  autoResolveOutdated,
  getPrHeadSha,
  graphqlWithRateLimit,
  makeBulkResponse,
  mockGetPrHeadSha,
  mockGraphql,
};
