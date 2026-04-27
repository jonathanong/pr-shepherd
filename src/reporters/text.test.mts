import { describe, it, expect } from "vitest";
import { formatText } from "./text.mts";
import type {
  ShepherdReport,
  ClassifiedCheck,
  TriagedCheck,
  ReviewThread,
  PrComment,
  Review,
} from "../types.mts";

function makeCheck(overrides: Partial<ClassifiedCheck> = {}): ClassifiedCheck {
  return {
    name: "ci / tests",
    status: "COMPLETED",
    conclusion: "SUCCESS",
    detailsUrl: "",
    event: "pull_request",
    runId: null,
    category: "passed",
    ...overrides,
  };
}

function makeThread(overrides: Partial<ReviewThread> = {}): ReviewThread {
  return {
    id: "thread-1",
    isResolved: false,
    isOutdated: false,
    isMinimized: false,
    path: "src/foo.ts",
    line: 10,
    startLine: null,
    author: "alice",
    body: "please fix this",
    url: "",
    createdAtUnix: 1_700_000_000,
    ...overrides,
  };
}

function makeReport(overrides: Partial<ShepherdReport> = {}): ShepherdReport {
  return {
    pr: 42,
    nodeId: "PR_kgDOAAA",
    repo: "owner/repo",
    status: "READY",
    baseBranch: "main",
    mergeStatus: {
      status: "CLEAN",
      state: "OPEN",
      isDraft: false,
      mergeable: "MERGEABLE",
      reviewDecision: "APPROVED",
      copilotReviewInProgress: false,
      mergeStateStatus: "CLEAN",
    },
    checks: {
      passing: [makeCheck()],
      failing: [],
      inProgress: [],
      skipped: [],
      filtered: [],
      filteredNames: [],
      blockedByFilteredCheck: false,
    },
    threads: { actionable: [], autoResolved: [], autoResolveErrors: [], firstLook: [] },
    comments: { actionable: [], firstLook: [] },
    changesRequestedReviews: [],
    reviewSummaries: [],
    approvedReviews: [],
    ...overrides,
  };
}

describe("formatText — header", () => {
  it("starts with H1 line — no leading blank line", () => {
    expect(formatText(makeReport()).split("\n")[0]).toBe("# PR #42 [CHECK] — owner/repo");
  });

  it("includes PR number and repo", () => {
    const out = formatText(makeReport());
    expect(out).toContain("PR #42");
    expect(out).toContain("owner/repo");
  });

  it("includes status", () => {
    const out = formatText(makeReport({ status: "FAILING" }));
    expect(out).toContain("Status: FAILING");
  });

  it("includes merge status heading and fields as a bullet list", () => {
    const out = formatText(makeReport());
    expect(out).toContain("## Merge Status");
    expect(out).toContain("- status: `CLEAN`");
    expect(out).toContain("- mergeStateStatus: `CLEAN`");
    expect(out).toContain("- mergeable: `MERGEABLE`");
    expect(out).not.toContain("  mergeStateStatus:");
  });
});

describe("formatText — CI check counts", () => {
  it("shows passed count out of total under ## CI Checks", () => {
    const report = makeReport({
      checks: {
        passing: [makeCheck(), makeCheck()],
        failing: [makeCheck({ category: "failing", conclusion: "FAILURE" })],
        inProgress: [],
        skipped: [],
        filtered: [],
        filteredNames: [],
        blockedByFilteredCheck: false,
      },
    });
    const out = formatText(report);
    expect(out).toContain("## CI Checks");
    expect(out).toContain("2/3 passed");
  });
});

describe("formatText — failed checks", () => {
  it("renders the conclusion in the failing check line", () => {
    const failing: TriagedCheck = {
      ...makeCheck({ category: "failing", conclusion: "TIMED_OUT" }),
    };
    const report = makeReport({
      checks: { ...makeReport().checks, failing: [failing] },
    });
    const out = formatText(report);
    expect(out).toContain("TIMED_OUT");
  });

  it("omits bracket when check has no additional metadata", () => {
    const failing: TriagedCheck = {
      ...makeCheck({ name: "lint", category: "failing", conclusion: "FAILURE" }),
    };
    const report = makeReport({
      checks: { ...makeReport().checks, failing: [failing] },
    });
    const out = formatText(report);
    const lintLine = out.split("\n").find((l) => l.includes("- lint:"));
    if (lintLine === undefined) throw new Error('Expected to find a line containing "- lint:"');
    expect(lintLine).not.toContain("[");
  });

  it("renders failedStep when present", () => {
    const failing: TriagedCheck = {
      ...makeCheck({ category: "failing", conclusion: "FAILURE" }),
      failedStep: "Run tests",
    };
    const report = makeReport({
      checks: { ...makeReport().checks, failing: [failing] },
    });
    const out = formatText(report);
    expect(out).toContain("    failed step: Run tests");
  });

  it("omits failed step line when failedStep is absent", () => {
    const failing: TriagedCheck = {
      ...makeCheck({ category: "failing", conclusion: "FAILURE" }),
    };
    const report = makeReport({
      checks: { ...makeReport().checks, failing: [failing] },
    });
    const out = formatText(report);
    expect(out).not.toContain("failed step:");
  });

  it("renders summary when present; omits when absent", () => {
    const withSummary: TriagedCheck = {
      ...makeCheck({ category: "failing", conclusion: "FAILURE" }),
      summary: "67.68% of diff hit (target 85.00%)",
    };
    const without: TriagedCheck = {
      ...makeCheck({ name: "lint", category: "failing", conclusion: "FAILURE" }),
    };
    const report = makeReport({
      checks: { ...makeReport().checks, failing: [withSummary, without] },
    });
    const out = formatText(report);
    expect(out).toContain("    summary: 67.68% of diff hit (target 85.00%)");
    expect(out).not.toContain("summary: undefined");
  });
});

describe("formatText — in-progress section", () => {
  it("shows in-progress section when non-empty", () => {
    const report = makeReport({
      checks: {
        ...makeReport().checks,
        inProgress: [
          makeCheck({ category: "in_progress", status: "IN_PROGRESS", conclusion: null }),
        ],
      },
    });
    const out = formatText(report);
    expect(out).toContain("### In Progress (1)");
  });

  it("omits in-progress section when empty", () => {
    const out = formatText(makeReport());
    expect(out).not.toContain("In Progress");
  });
});

describe("formatText — skipped section", () => {
  it("shows skipped check names joined", () => {
    const report = makeReport({
      checks: {
        ...makeReport().checks,
        skipped: [
          makeCheck({ name: "deploy", category: "skipped", conclusion: "SKIPPED" }),
          makeCheck({ name: "e2e", category: "skipped", conclusion: "SKIPPED" }),
        ],
      },
    });
    const out = formatText(report);
    expect(out).toContain("### Skipped (2): deploy, e2e");
  });
});

describe("formatText — filtered checks notes", () => {
  it("shows blockedByFilteredCheck note when flag is true", () => {
    const report = makeReport({
      checks: {
        ...makeReport().checks,
        filtered: [makeCheck({ category: "filtered" })],
        filteredNames: ["required-check"],
        blockedByFilteredCheck: true,
      },
      mergeStatus: { ...makeReport().mergeStatus, status: "BLOCKED", mergeStateStatus: "BLOCKED" },
    });
    const out = formatText(report);
    expect(out).toContain("PR is BLOCKED and all filtered checks are non-PR-trigger");
  });

  it("shows alternative BLOCKED note when blockedByFilteredCheck is false", () => {
    const report = makeReport({
      checks: {
        ...makeReport().checks,
        filtered: [makeCheck({ category: "filtered" })],
        filteredNames: ["other-check"],
        blockedByFilteredCheck: false,
      },
      mergeStatus: { ...makeReport().mergeStatus, status: "BLOCKED", mergeStateStatus: "BLOCKED" },
    });
    const out = formatText(report);
    expect(out).toContain("one or more of these filtered checks may be a required status check");
    expect(out).not.toContain("PR is BLOCKED and all filtered");
  });
});

describe("formatText — threads and comments", () => {
  it("shows auto-resolved threads under ## Review Threads", () => {
    const report = makeReport({
      threads: {
        actionable: [],
        autoResolved: [makeThread({ id: "t-1", path: "src/bar.ts", line: 5, author: "bob" })],
        autoResolveErrors: [],
        firstLook: [],
      },
    });
    const out = formatText(report);
    expect(out).toContain("## Review Threads");
    expect(out).toContain("Auto-resolved outdated (1):");
    expect(out).toContain("threadId=t-1");
  });

  it("shows autoResolveErrors", () => {
    const report = makeReport({
      threads: {
        actionable: [],
        autoResolved: [],
        autoResolveErrors: ["thread-x: GraphQL error"],
        firstLook: [],
      },
    });
    const out = formatText(report);
    expect(out).toContain("Auto-resolve errors (1):");
    expect(out).toContain("thread-x: GraphQL error");
  });

  it("shows (general) label when thread path is null", () => {
    const report = makeReport({
      threads: {
        actionable: [makeThread({ id: "t-1", path: null, line: null, author: "alice" })],
        autoResolved: [],
        autoResolveErrors: [],
        firstLook: [],
      },
    });
    const out = formatText(report);
    expect(out).toContain("(general)");
  });

  it("shows path:line when thread has a path", () => {
    const report = makeReport({
      threads: {
        actionable: [makeThread({ id: "t-2", path: "src/index.ts", line: 42, author: "alice" })],
        autoResolved: [],
        autoResolveErrors: [],
        firstLook: [],
      },
    });
    const out = formatText(report);
    expect(out).toContain("src/index.ts:42");
  });

  it("caps thread body to 120 chars on first line", () => {
    const longBody = "x".repeat(130) + "\nshould not appear";
    const report = makeReport({
      threads: {
        actionable: [makeThread({ body: longBody })],
        autoResolved: [],
        autoResolveErrors: [],
        firstLook: [],
      },
    });
    const out = formatText(report);
    expect(out).toContain("x".repeat(120));
    expect(out).not.toContain("x".repeat(121));
    expect(out).not.toContain("should not appear");
  });

  it("shows actionable PR comments under ## PR Comments", () => {
    const comment: PrComment = {
      id: "c-1",
      isMinimized: false,
      author: "carol",
      body: "nit: rename this",
      url: "",
      createdAtUnix: 1_700_000_000,
    };
    const report = makeReport({
      comments: { actionable: [comment], firstLook: [] },
    });
    const out = formatText(report);
    expect(out).toContain("## PR Comments");
    expect(out).toContain("commentId=c-1");
    expect(out).toContain("@carol");
  });

  it("shows CHANGES_REQUESTED reviews under ## CHANGES_REQUESTED Reviews", () => {
    const review: Review = { id: "r-1", author: "dave", body: "please fix the types" };
    const report = makeReport({ changesRequestedReviews: [review] });
    const out = formatText(report);
    expect(out).toContain("## CHANGES_REQUESTED Reviews");
    expect(out).toContain("reviewId=r-1");
  });
});

describe("formatText — summary line", () => {
  it("shows '0 actionable' when everything is clean", () => {
    const out = formatText(makeReport());
    expect(out).toContain("0 actionable — all threads resolved/minimized");
  });

  it("shows count when actionable items remain", () => {
    const report = makeReport({
      threads: {
        actionable: [makeThread(), makeThread({ id: "t-2" })],
        autoResolved: [],
        autoResolveErrors: [],
        firstLook: [],
      },
    });
    const out = formatText(report);
    expect(out).toContain("2 actionable");
  });
});

describe("formatText — ## Instructions section", () => {
  it("includes ## Instructions heading", () => {
    const out = formatText(makeReport());
    expect(out).toContain("## Instructions");
  });

  it("has numbered steps", () => {
    const out = formatText(makeReport());
    expect(out).toMatch(/1\. /);
    expect(out).toMatch(/2\. /);
  });

  it("includes ready-to-merge declaration when READY+CLEAN", () => {
    const out = formatText(makeReport());
    expect(out).toContain("ready to merge");
  });

  it("includes do-not-merge instruction when not READY", () => {
    const out = formatText(makeReport({ status: "FAILING" }));
    expect(out).toContain("Do not declare");
  });

  it("includes rebase instruction for CONFLICTS", () => {
    const report = makeReport({
      mergeStatus: {
        ...makeReport().mergeStatus,
        status: "CONFLICTS",
        mergeStateStatus: "DIRTY",
      },
    });
    const out = formatText(report);
    expect(out).toContain("Rebase required");
  });

  it("includes fix-code instruction for actionable failures", () => {
    const failing: TriagedCheck = {
      ...makeCheck({ name: "lint", category: "failing", conclusion: "FAILURE" }),
    };
    const report = makeReport({
      checks: { ...makeReport().checks, failing: [failing] },
    });
    const out = formatText(report);
    expect(out).toContain("Failing check:");
    expect(out).toContain("lint");
  });

  it("includes rerun hint for failures with runId", () => {
    const failing: TriagedCheck = {
      ...makeCheck({ name: "build", category: "failing", conclusion: "TIMED_OUT", runId: "12345" }),
    };
    const report = makeReport({
      checks: { ...makeReport().checks, failing: [failing] },
    });
    const out = formatText(report);
    expect(out).toContain("gh run rerun 12345 --failed");
  });

  it("mentions /pr-shepherd:monitor for non-READY PRs", () => {
    const out = formatText(makeReport({ status: "FAILING" }));
    expect(out).toContain("/pr-shepherd:monitor");
  });
});

describe("formatText — baseBranch, reviewSummaries, approvedReviews", () => {
  it("includes Base: field with baseBranch", () => {
    const out = formatText(makeReport({ baseBranch: "main" }));
    expect(out).toContain("Base: main");
  });

  it("includes ## Review Summaries section when non-empty", () => {
    const report = makeReport({
      reviewSummaries: [
        { id: "PRR_1", author: "copilot", body: "Looks good overall.\nSome details." },
      ],
    });
    const out = formatText(report);
    expect(out).toContain("## Review Summaries");
    expect(out).toContain("reviewId=PRR_1 (@copilot)");
    expect(out).toContain("Looks good overall.");
  });

  it("omits ## Review Summaries section when empty", () => {
    const out = formatText(makeReport({ reviewSummaries: [] }));
    expect(out).not.toContain("## Review Summaries");
  });

  it("includes ## Approved Reviews section when non-empty", () => {
    const report = makeReport({
      approvedReviews: [{ id: "PRR_2", author: "alice", body: "LGTM!" }],
    });
    const out = formatText(report);
    expect(out).toContain("## Approved Reviews");
    expect(out).toContain("reviewId=PRR_2 (@alice)");
    expect(out).toContain("LGTM!");
  });

  it("omits ## Approved Reviews section when empty", () => {
    const out = formatText(makeReport({ approvedReviews: [] }));
    expect(out).not.toContain("## Approved Reviews");
  });
});

describe("formatText — first-look items", () => {
  it("renders ## First-look items section", () => {
    const thread = {
      ...makeThread({ id: "PRRT_abc", isOutdated: true }),
      firstLookStatus: "outdated" as const,
    };
    const comment = {
      id: "PRRC_xyz",
      isMinimized: true,
      author: "bob",
      body: "nit",
      url: "",
      createdAtUnix: 0,
      firstLookStatus: "minimized" as const,
    };
    const report = makeReport({
      threads: { actionable: [], autoResolved: [], autoResolveErrors: [], firstLook: [thread] },
      comments: { actionable: [], firstLook: [comment] },
    });
    const out = formatText(report);
    expect(out).toContain("## First-look items (2) — already closed on GitHub; acknowledge only");
    expect(out).toContain("`threadId=PRRT_abc`");
    expect(out).toContain("[status: outdated]");
    expect(out).toContain("`commentId=PRRC_xyz`");
    expect(out).toContain("[status: minimized]");
  });
});
