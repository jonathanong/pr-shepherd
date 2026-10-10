import { vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Mock github/client.mts before any imports.
// ---------------------------------------------------------------------------

vi.mock("../../src/github/client.mts", () => ({
  graphqlWithRateLimit: vi.fn(),
  getPrHeadSha: vi.fn(),
}));
vi.mock("../../src/github/reply-recovery-read.mts", () => ({
  readReplyRecoveryEvidence: vi.fn(async () => new Map()),
}));

import { applyResolveOptions, autoResolveOutdated } from "../../src/comments/resolve.mts";
import { graphqlWithRateLimit, getPrHeadSha } from "../../src/github/client.mts";

const mockGraphql = vi.mocked(graphqlWithRateLimit);
const mockGetPrHeadSha = vi.mocked(getPrHeadSha);

const REPO = { owner: "owner", name: "repo" };

/** Build a mock response with the correct nested shape for each alias type (r/m/d). */
function makeBulkResponse(doc: unknown): { data: Record<string, unknown> } {
  const str = typeof doc === "string" ? doc : "";
  const data: Record<string, unknown> = {};
  for (const match of str.matchAll(/^\s+([a-z]\d+):/gm)) {
    const alias = match[1];
    if (alias === undefined) continue;
    if (alias.startsWith("r")) data[alias] = { thread: { isResolved: true } };
    else if (alias.startsWith("p")) data[alias] = { comment: { id: `${alias}-comment` } };
    else if (alias.startsWith("m")) data[alias] = { minimizedComment: { isMinimized: true } };
    else if (alias.startsWith("d")) data[alias] = { pullRequestReview: { state: "DISMISSED" } };
    else data[alias] = {};
  }
  return { data };
}

// ---------------------------------------------------------------------------
// applyResolveOptions
// ---------------------------------------------------------------------------

export function registerHooks(): void {
  let stateDirectory: string;
  beforeEach(async () => {
    stateDirectory = await mkdtemp(join(tmpdir(), "pr-shepherd-resolve-mock-"));
    vi.stubEnv("PR_SHEPHERD_STATE_DIR", stateDirectory);
    vi.clearAllMocks();
    mockGraphql.mockReset();
    mockGraphql.mockImplementation(async (doc) => makeBulkResponse(doc));
  });
  afterEach(async () => {
    await rm(stateDirectory, { recursive: true, force: true });
    vi.unstubAllEnvs();
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
