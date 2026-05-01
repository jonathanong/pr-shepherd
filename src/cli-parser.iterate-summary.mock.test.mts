import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./commands/check.mts", () => ({ runCheck: vi.fn() }));
vi.mock("./commands/resolve.mts", () => ({
  runResolveFetch: vi.fn(),
  runResolveMutate: vi.fn(),
}));
vi.mock("./commands/commit-suggestion.mts", () => ({
  runCommitSuggestion: vi.fn(),
}));
vi.mock("./commands/iterate.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./commands/iterate.mts")>();
  return { ...actual, runIterate: vi.fn() };
});
vi.mock("./commands/status.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./commands/status.mts")>();
  return {
    ...actual,
    runStatus: vi.fn(),
    formatStatusTable: vi.fn().mockReturnValue("status table"),
  };
});
vi.mock("./github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "owner", name: "repo" }),
}));

import { main } from "./cli-parser.mts";
import { runIterate } from "./commands/iterate.mts";
import { runStatus } from "./commands/status.mts";
import type { IterateResult } from "./types.mts";

const mockRunIterate = vi.mocked(runIterate);
const mockRunStatus = vi.mocked(runStatus);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stdoutSpy: any;
let stderrSpy: any;

function makeFixCodeResult(): IterateResult & { action: "fix_code" } {
  return {
    pr: 42,
    repo: "owner/repo",
    status: "IN_PROGRESS" as const,
    state: "OPEN" as const,
    mergeStateStatus: "BLOCKED" as const,
    mergeStatus: "BLOCKED" as const,
    reviewDecision: null,
    copilotReviewInProgress: false,
    isDraft: false,
    shouldCancel: false,
    remainingSeconds: 60,
    summary: { passing: 0, skipped: 0, filtered: 0, inProgress: 1 },
    baseBranch: "main",
    checks: [],
    action: "fix_code",
    fix: {
      mode: "rebase-and-push",
      threads: [],
      actionableComments: [],
      reviewSummaryIds: [],
      firstLookSummaries: [],
      editedSummaries: [],
      surfacedApprovals: [],
      checks: [],
      changesRequestedReviews: [],
      resolveCommand: {
        argv: ["npx", "pr-shepherd", "resolve", "42"],
        requiresHeadSha: true,
        requiresDismissMessage: false,
        hasMutations: false,
      },
      instructions: ["End this iteration."],
      firstLookThreads: [],
      firstLookComments: [],
    },
    cancelled: [],
  };
}

function getStdout(): string {
  return stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join("");
}

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  mockRunStatus.mockResolvedValue([]);
});

afterEach(() => {
  process.exitCode = undefined;
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
});

describe("main — iterate summary field rendering in ## Failing checks", () => {
  it("summary blockquote rendered when present, omitted when absent", async () => {
    const result = makeFixCodeResult();
    result.fix.checks = [
      {
        name: "codecov/patch",
        runId: null,
        detailsUrl: "https://app.codecov.io/a/b",
        conclusion: "FAILURE" as const,
        summary: "67.68% of diff hit (target 85.00%)",
      },
      {
        name: "lint",
        runId: "run-42",
        detailsUrl: null,
        conclusion: "FAILURE" as const,
        // no summary
      },
    ];
    mockRunIterate.mockResolvedValue(result);
    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    // summary rendered as blockquote
    expect(out).toContain("  > 67.68% of diff hit (target 85.00%)");
    // check without summary has no trailing blockquote line for it
    expect(out).toContain("- `run-42` — `lint`");
    expect(out).not.toMatch(/`lint`\s*\n\s*>/);
    // multiple failing checks separated by blank line
    expect(out).toMatch(/codecov\/patch[\s\S]+\n\n- /);
  });

  it("failedStep blockquote rendered when present", async () => {
    const result = makeFixCodeResult();
    result.fix.checks = [
      {
        name: "lint / typecheck / test (22.x)",
        runId: "run-99",
        detailsUrl: null,
        conclusion: "FAILURE" as const,
        workflowName: "CI",
        failedStep: "Run npm run lint",
      },
    ];
    mockRunIterate.mockResolvedValue(result);
    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toContain("- `run-99` — `CI › lint / typecheck / test (22.x)`");
    expect(out).toContain("  > Run npm run lint");
  });
});
