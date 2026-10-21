import { vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/commands/check.mts", () => ({ runCheck: vi.fn() }));
vi.mock("../src/commands/resolve.mts", () => ({
  runResolveMutate: vi.fn(),
}));
vi.mock("../src/commands/suggestion-patches.mts", () => ({
  runSuggestionPatches: vi.fn(),
}));
vi.mock("../src/commands/iterate/index.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/commands/iterate/index.mts")>();
  return { ...actual, runIterate: vi.fn() };
});
vi.mock("../src/github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "owner", name: "repo" }),
}));

import { main } from "../src/cli-parser.mts";
import { runSuggestionPatches } from "../src/commands/suggestion-patches.mts";

const mockRunSuggestionPatches = vi.mocked(runSuggestionPatches);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stdoutSpy: any;
let stderrSpy: any;

function getStdout(): string {
  return stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SUGGESTIONS_RESULT = {
  pr: 42,
  repo: "owner/repo",
  patches: [
    {
      threadId: "t1",
      path: "a.ts",
      startLine: 5,
      endLine: 5,
      author: "alice",
      patch: "--- a/a.ts\n+++ b/a.ts\n@@ -5,1 +5,1 @@\n-old\n+new\n",
      commitMessage: "apply fix",
      commitBody: "Co-authored-by: alice <alice@users.noreply.github.com>",
      filesToStage: ["a.ts"],
    },
  ],
  postActionInstructions: ["Apply patch 1.", "Push once."],
};

// ---------------------------------------------------------------------------
// suggest dispatch
// ---------------------------------------------------------------------------

export function registerHooks(): void {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });
  afterEach(() => {
    process.exitCode = undefined;
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });
}

export {
  SUGGESTIONS_RESULT,
  getStdout,
  main,
  mockRunSuggestionPatches,
  runSuggestionPatches,
  stderrSpy,
  stdoutSpy,
};
