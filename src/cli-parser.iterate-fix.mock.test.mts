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
import { makeIterateResult } from "./cli-parser.iterate-fixtures.mts";

const mockRunIterate = vi.mocked(runIterate);
const mockRunStatus = vi.mocked(runStatus);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stdoutSpy: any;
let stderrSpy: any;

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

// ---------------------------------------------------------------------------
// formatIterateResult — fix_code actions and ## Checks section
// ---------------------------------------------------------------------------

describe("main — iterate text format (fix_code and checks)", () => {
  it("fix_code (empty payload): heading + base/summary + Post-fix push + fallback Instructions", async () => {
    mockRunIterate.mockResolvedValue(makeIterateResult("fix_code"));
    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toContain("# PR #42 [FIX_CODE]");
    expect(out).toContain("## Post-fix push");
    expect(out).not.toContain("## Rebase");
    expect(out).toContain("- base: `main`");
    // hasMutations: false in the fixture → resolve line is omitted (no-op commit).
    expect(out).not.toContain("- resolve:");
    // No item sections.
    expect(out).not.toContain("## Review threads");
    expect(out).not.toContain("## Actionable comments");
    expect(out).not.toContain("## Failing checks");
    expect(out).not.toContain("## Changes-requested reviews");
    expect(out).not.toContain("## Noise");
    expect(out).not.toContain("## Cancelled runs");
    // Fallback instruction always present for consistency with the invariant that
    // every iterate output ends with ## Instructions.
    expect(out).toContain("## Instructions");
    expect(out).toContain("1. End this iteration.");
  });

  it("fix_code (rich payload): sections appear in fixed order with backtick-quoted codes", async () => {
    const result: IterateResult = {
      ...makeIterateResult("fix_code"),
    };
    if (result.action !== "fix_code") throw new Error("unreachable");
    result.fix = {
      mode: "rebase-and-push",
      threads: [
        {
          id: "PRRT_1",
          path: "src/foo.ts",
          line: 10,
          author: "reviewer",
          body: "fix\nsecond line is now preserved",
          url: "",
        },
      ],
      actionableComments: [{ id: "PRRC_1", author: "bot", body: "please address", url: "" }],
      noiseCommentIds: ["c-noise-1", "c-noise-2"],
      reviewSummaryIds: [],
      surfacedApprovals: [],
      checks: [
        { name: "lint", runId: "run-42", detailsUrl: "https://x" },
        {
          name: "codecov/patch",
          runId: null,
          detailsUrl: "https://app.codecov.io",
        },
      ],
      changesRequestedReviews: [{ id: "REV_1", author: "reviewer", body: "please rework this" }],
      resolveCommand: {
        argv: [
          "npx",
          "pr-shepherd",
          "resolve",
          "42",
          "--dismiss-review-ids",
          "REV_1",
          "--message",
          "$DISMISS_MESSAGE",
        ],
        requiresHeadSha: true,
        requiresDismissMessage: true,
        hasMutations: true,
      },
      instructions: ["step one", "step two"],
      firstLookThreads: [],
      firstLookComments: [],
    };
    result.cancelled = ["run-99"];
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();

    // Section ordering: threads → comments → checks → reviews → noise → cancelled → Post-fix push → Instructions.
    const order = [
      "## Review threads",
      "## Actionable comments",
      "## Failing checks",
      "## Changes-requested reviews",
      "## Noise (minimize only)",
      "## Cancelled runs",
      "## Post-fix push",
      "## Instructions",
    ];
    let cursor = 0;
    for (const heading of order) {
      const idx = out.indexOf(heading, cursor);
      expect(idx).toBeGreaterThanOrEqual(cursor);
      cursor = idx + heading.length;
    }

    // Thread section: H3 header with backticked id and location.
    expect(out).toContain("### `PRRT_1` — `src/foo.ts:10` (@reviewer)");
    // Multi-line body is blockquoted.
    expect(out).toContain("> fix\n> second line is now preserved");
    // Comment section
    expect(out).toContain("### `PRRC_1` (@bot)");
    expect(out).toContain("> please address");
    // Failing checks — GitHub Actions and external (no failureKind label).
    expect(out).toContain("- `run-42` — `lint`");
    expect(out).toContain("- external `https://app.codecov.io` — `codecov/patch`");
    // Reviews
    expect(out).toContain("- `REV_1` (@reviewer)");
    // Noise — backticked IDs, comma-separated.
    expect(out).toContain("`c-noise-1`, `c-noise-2`");
    // Cancelled runs
    expect(out).toContain("`run-99`");
    // Post-fix push section uses backticked base + resolve command with --require-sha appended.
    expect(out).toContain("- base: `main`");
    expect(out).toContain(
      '- resolve: `npx pr-shepherd resolve 42 --dismiss-review-ids REV_1 --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`',
    );
    // Instructions are numbered.
    expect(out).toContain("1. step one");
    expect(out).toContain("2. step two");
  });

  it("fix_code: renders '## Review summaries (minimize only)' section when reviewSummaryIds is non-empty", async () => {
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code") throw new Error("unreachable");
    if (result.fix.mode !== "rebase-and-push") throw new Error("unreachable");
    result.fix.reviewSummaryIds = ["PRR_BOT", "PRR_AP"];
    result.fix.resolveCommand = {
      argv: ["npx", "pr-shepherd", "resolve", "42", "--minimize-comment-ids", "PRR_BOT,PRR_AP"],
      requiresHeadSha: false,
      requiresDismissMessage: false,
      hasMutations: true,
    };
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();

    expect(out).toContain("## Review summaries (minimize only)");
    expect(out).toContain("`PRR_BOT`, `PRR_AP`");
    expect(out).toContain(
      "- resolve: `npx pr-shepherd resolve 42 --minimize-comment-ids PRR_BOT,PRR_AP`",
    );
    expect(out).not.toContain("## Approvals (surfaced");
  });

  it("fix_code: renders '## Approvals (surfaced — not minimized)' with H3 + blockquote", async () => {
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code") throw new Error("unreachable");
    if (result.fix.mode !== "rebase-and-push") throw new Error("unreachable");
    result.fix.surfacedApprovals = [
      { id: "PRR_HUMAN", author: "alice", body: "Looks reasonable but please double-check X." },
    ];
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();

    expect(out).toContain("## Approvals (surfaced — not minimized)");
    expect(out).toContain("### `PRR_HUMAN` (@alice)");
    expect(out).toContain("> Looks reasonable but please double-check X.");
  });

  it("fix_code: approval with empty body renders '(no review body)' instead of bare blockquote", async () => {
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code") throw new Error("unreachable");
    if (result.fix.mode !== "rebase-and-push") throw new Error("unreachable");
    result.fix.surfacedApprovals = [{ id: "PRR_EMPTY", author: "alice", body: "" }];
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();

    expect(out).toContain("### `PRR_EMPTY` (@alice)");
    expect(out).toContain("(no review body)");
    expect(out).not.toContain("\n>\n");
  });

  it("fix_code: multi-paragraph thread body is preserved verbatim in the blockquote", async () => {
    const multiParagraphBody = [
      "First paragraph giving context.",
      "",
      "Second paragraph with a specific suggestion about line 42.",
      "",
      "Third paragraph with a ```suggestion``` block that must survive.",
    ].join("\n");
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code") throw new Error("unreachable");
    result.fix.threads = [
      {
        id: "t-multi",
        path: "src/x.ts",
        line: 1,
        author: "reviewer",
        body: multiParagraphBody,
        url: "",
      },
    ];
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    const lines = out.split("\n");
    const headerIdx = lines.findIndex((l) => l === "### `t-multi` — `src/x.ts:1` (@reviewer)");
    expect(headerIdx).toBeGreaterThan(-1);
    // Blockquote follows after a blank line; empty paragraphs are rendered as bare `>`.
    expect(lines[headerIdx + 2]).toBe("> First paragraph giving context.");
    expect(lines[headerIdx + 3]).toBe(">");
    expect(lines[headerIdx + 4]).toBe(
      "> Second paragraph with a specific suggestion about line 42.",
    );
    expect(lines[headerIdx + 5]).toBe(">");
    expect(lines[headerIdx + 6]).toBe(
      "> Third paragraph with a ```suggestion``` block that must survive.",
    );
  });

  it("fix_code: CRLF line endings in thread body are normalized in blockquote", async () => {
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code") throw new Error("unreachable");
    result.fix.threads = [
      {
        id: "t-crlf",
        path: "src/x.ts",
        line: 1,
        author: "reviewer",
        body: "First line.\r\nSecond line.",
        url: "",
      },
    ];
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toContain("> First line.\n> Second line.");
    expect(out).not.toContain("\r");
  });

  it("fix_code: check with runId=null + detailsUrl renders 'external `<url>`', without detailsUrl falls back to '(no runId)'", async () => {
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code" || result.fix.mode !== "rebase-and-push") {
      throw new Error("unreachable");
    }
    result.fix.checks = [
      {
        name: "codecov/patch",
        runId: null,
        detailsUrl: "https://app.codecov.io/a/b",
      },
      {
        name: "mystery-check",
        runId: null,
        detailsUrl: null,
      },
    ];
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toContain("- external `https://app.codecov.io/a/b` — `codecov/patch`");
    expect(out).toContain("- (no runId) — `mystery-check`");
  });

  it("fix_code: thread with url renders markdown link heading; comment with url renders markdown link heading", async () => {
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code") throw new Error("unreachable");
    result.fix.threads = [
      {
        id: "PRRT_linked",
        path: "src/x.ts",
        line: 5,
        author: "reviewer",
        body: "nit",
        url: "https://github.com/owner/repo/pull/1#discussion_r1",
      },
    ];
    result.fix.actionableComments = [
      {
        id: "PRRC_linked",
        author: "bob",
        body: "please fix",
        url: "https://github.com/owner/repo/pull/1#issuecomment-1",
      },
    ];
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toContain(
      "### [PRRT_linked](https://github.com/owner/repo/pull/1#discussion_r1) — `src/x.ts:5` (@reviewer)",
    );
    expect(out).toContain(
      "### [PRRC_linked](https://github.com/owner/repo/pull/1#issuecomment-1) (@bob)",
    );
    expect(out).not.toContain("### `PRRT_linked`");
    expect(out).not.toContain("### `PRRC_linked`");
  });

  it("fix_code: logTail with embedded backticks uses a fence longer than the longest run", async () => {
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code" || result.fix.mode !== "rebase-and-push") {
      throw new Error("unreachable");
    }
    result.fix.checks = [
      {
        name: "build",
        runId: "42",
        detailsUrl: null,
        logTail: "error: expected ``` here\nbut got `foo` instead",
      },
    ];
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    // logTail contains ``` (3 backticks), so fence must be at least 4 backticks.
    expect(out).toContain("  ````");
    expect(out).not.toMatch(/^  ```\n/m);
    // Content should be indented inside the fence.
    expect(out).toContain("  error: expected ``` here");
  });

  it("non-fix_code actions do not emit ## Checks — check count is in summary header only", async () => {
    const result = makeIterateResult("wait");
    result.checks = [
      {
        name: "lint",
        conclusion: "FAILURE",
        runId: "run-1",
        detailsUrl: null,
      },
    ] as import("./types.mts").RelevantCheck[];
    mockRunIterate.mockResolvedValue(result);
    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).not.toContain("## Checks");
  });
});
