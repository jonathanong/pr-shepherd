import { describe, it, expect } from "vitest";
import {
  registerHooks,
  getStdout,
  mockRunIterate,
} from "../test-helpers/cli-parser.iterate-fix.test-support.mts";
import { makeIterateResult } from "../fixtures/cli-parser.iterate-fixtures.mts";
import { main } from "./cli-parser.mts";
import type { IterateResult } from "../test-helpers/cli-parser.iterate-fix.test-support.mts";

registerHooks();

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
    expect(out).toContain("Stop this iteration — if you pushed new commits");
  });
  it("fix_code (rich payload): sections appear in fixed order with backtick-quoted codes", async () => {
    const result: IterateResult = {
      ...makeIterateResult("fix_code"),
    };
    if (result.action !== "fix_code") throw new Error("unreachable");
    result.fix = {
      threads: [
        {
          id: "PRRT_1",
          path: "src/foo.ts",
          line: 10,
          author: "reviewer",
          authorType: "Unknown" as const,
          body: "fix\nsecond line is now preserved",
          url: "",
        },
      ],
      resolutionOnlyThreads: [],
      actionableComments: [
        {
          id: "PRRC_1",
          author: "bot",
          authorType: "Unknown" as const,
          body: "please address",
          url: "",
        },
      ],
      reviewSummaryIds: [],
      firstLookSummaries: [],
      editedSummaries: [],
      surfacedApprovals: [],
      checks: [
        { name: "lint", runId: "run-42", detailsUrl: "https://x", conclusion: "FAILURE" as const },
        {
          name: "codecov/patch",
          runId: null,
          detailsUrl: "https://app.codecov.io",
          conclusion: "FAILURE" as const,
        },
      ],
      changesRequestedReviews: [
        {
          id: "REV_1",
          author: "reviewer",
          authorType: "Unknown" as const,
          body: "please rework this",
        },
      ],
      resolveCommand: {
        argv: [
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
      inProgressRunIds: [],
      protectedRuns: [],
    };
    result.cancelled = ["run-99"];
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();

    // Section ordering: threads → comments → checks → reviews → cancelled → Post-fix push → Instructions.
    const order = [
      "## Review threads",
      "## Actionable comments",
      "## Failing checks",
      "## Changes-requested reviews",
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

    // Thread section: H3 header with backticked threadId= and location.
    expect(out).toContain("### `threadId=PRRT_1` — `src/foo.ts:10` (@reviewer · Unknown)");
    // Multi-line body is blockquoted.
    expect(out).toContain("> fix\n> second line is now preserved");
    // Comment section
    expect(out).toContain("### `commentId=PRRC_1` (@bot · Unknown)");
    expect(out).toContain("> please address");
    // Failing checks — GitHub Actions and external (no failureKind label).
    expect(out).toContain("- `run-42` — `lint`");
    expect(out).toContain("- external `https://app.codecov.io` — `codecov/patch`");
    // Reviews
    expect(out).toContain("- `reviewId=REV_1` (@reviewer · Unknown)");
    // Cancelled runs
    expect(out).toContain("`run-99`");
    // Post-fix push section uses backticked base + resolve command with --require-sha appended.
    expect(out).toContain("- base: `main`");
    expect(out).toContain(
      '- resolve: `pr-shepherd resolve 42 --dismiss-review-ids REV_1 --message "$DISMISS_MESSAGE" --require-sha "$HEAD_SHA"`',
    );
    // Instructions are numbered.
    expect(out).toContain("1. step one");
    expect(out).toContain("2. step two");
  });
});
