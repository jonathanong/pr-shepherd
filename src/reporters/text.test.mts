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
    path: "src/foo.ts",
    line: 10,
    author: "alice",
    body: "please fix this",
    createdAtUnix: 1_700_000_000,
    ...overrides,
  };
}

function makeReport(overrides: Partial<ShepherdReport> = {}): ShepherdReport {
  return {
    pr: 42,
    repo: "owner/repo",
    status: "READY",
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
    threads: { actionable: [], autoResolved: [], autoResolveErrors: [] },
    comments: { actionable: [] },
    changesRequestedReviews: [],
    ...overrides,
  };
}

describe("formatText — header", () => {
  it("includes PR number and repo", () => {
    const out = formatText(makeReport());
    expect(out).toContain("PR #42");
    expect(out).toContain("owner/repo");
  });

  it("includes status", () => {
    const out = formatText(makeReport({ status: "FAILING" }));
    expect(out).toContain("Status: FAILING");
  });

  it("includes merge status fields", () => {
    const out = formatText(makeReport());
    expect(out).toContain("Merge Status: CLEAN");
    expect(out).toContain("mergeStateStatus:");
    expect(out).toContain("mergeable:");
  });
});

describe("formatText — CI check counts", () => {
  it("shows passed count out of total", () => {
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
    expect(out).toContain("2/3 passed");
  });
});

describe("formatText — failed checks", () => {
  it("shows failureKind bracket when present", () => {
    const failing: TriagedCheck = {
      ...makeCheck({ category: "failing", conclusion: "FAILURE" }),
      failureKind: "timeout",
    };
    const report = makeReport({
      checks: { ...makeReport().checks, failing: [failing] },
    });
    const out = formatText(report);
    expect(out).toContain("[timeout]");
  });

  it("omits bracket when failureKind is absent", () => {
    const failing: TriagedCheck = {
      ...makeCheck({ name: "lint", category: "failing", conclusion: "FAILURE" }),
    };
    const report = makeReport({
      checks: { ...makeReport().checks, failing: [failing] },
    });
    const out = formatText(report);
    expect(out).toContain("- lint:");
    expect(out).not.toContain("[");
  });

  it("indents logExcerpt with 4 spaces", () => {
    const failing: TriagedCheck = {
      ...makeCheck({ category: "failing", conclusion: "FAILURE" }),
      failureKind: "actionable",
      logExcerpt: "error: something went wrong",
    };
    const report = makeReport({
      checks: { ...makeReport().checks, failing: [failing] },
    });
    const out = formatText(report);
    expect(out).toContain("    error: something went wrong");
  });

  it("takes only the last 10 lines of logExcerpt", () => {
    const allLines = Array.from({ length: 15 }, (_, i) => `line ${i + 1}`);
    const failing: TriagedCheck = {
      ...makeCheck({ category: "failing", conclusion: "FAILURE" }),
      failureKind: "actionable",
      logExcerpt: allLines.join("\n"),
    };
    const report = makeReport({
      checks: { ...makeReport().checks, failing: [failing] },
    });
    const out = formatText(report);
    expect(out).toContain("line 15");
    expect(out).not.toContain("line 5"); // first 5 lines should be excluded
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
    expect(out).toContain("In Progress (1):");
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
    expect(out).toContain("Skipped (2): deploy, e2e");
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
  it("shows auto-resolved threads", () => {
    const report = makeReport({
      threads: {
        actionable: [],
        autoResolved: [makeThread({ id: "t-1", path: "src/bar.ts", line: 5, author: "bob" })],
        autoResolveErrors: [],
      },
    });
    const out = formatText(report);
    expect(out).toContain("Auto-resolved outdated threads (1):");
    expect(out).toContain("threadId=t-1");
  });

  it("shows autoResolveErrors", () => {
    const report = makeReport({
      threads: {
        actionable: [],
        autoResolved: [],
        autoResolveErrors: ["thread-x: GraphQL error"],
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
      },
    });
    const out = formatText(report);
    expect(out).toContain("x".repeat(120));
    expect(out).not.toContain("x".repeat(121));
    expect(out).not.toContain("should not appear");
  });

  it("shows actionable PR comments", () => {
    const comment: PrComment = {
      id: "c-1",
      isMinimized: false,
      author: "carol",
      body: "nit: rename this",
      createdAtUnix: 1_700_000_000,
    };
    const report = makeReport({
      comments: { actionable: [comment] },
    });
    const out = formatText(report);
    expect(out).toContain("Actionable PR Comments (1):");
    expect(out).toContain("commentId=c-1");
    expect(out).toContain("@carol");
  });

  it("shows CHANGES_REQUESTED reviews", () => {
    const review: Review = { id: "r-1", author: "dave", body: "please fix the types" };
    const report = makeReport({ changesRequestedReviews: [review] });
    const out = formatText(report);
    expect(out).toContain("Pending CHANGES_REQUESTED reviews (1):");
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
      },
    });
    const out = formatText(report);
    expect(out).toContain("2 actionable item(s) remaining");
  });
});
