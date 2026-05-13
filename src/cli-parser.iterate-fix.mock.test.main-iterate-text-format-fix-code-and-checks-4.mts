// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerHooks,
  getStdout,
  main,
  makeIterateResult,
  mockRunIterate,
} from "./cli-parser.iterate-fix.test-support.mts";

registerHooks();

describe("main — iterate text format (fix_code and checks)", () => {
  it("fix_code: thread with url renders markdown link heading; comment with url renders markdown link heading", async () => {
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code") throw new Error("unreachable");
    result.fix.threads = [
      {
        id: "PRRT_linked",
        path: "src/x.ts",
        line: 5,
        author: "reviewer",
        authorType: "Unknown" as const,
        body: "nit",
        url: "https://github.com/owner/repo/pull/1#discussion_r1",
      },
    ];
    result.fix.actionableComments = [
      {
        id: "PRRC_linked",
        author: "bob",
        authorType: "Unknown" as const,
        body: "please fix",
        url: "https://github.com/owner/repo/pull/1#issuecomment-1",
      },
    ];
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toContain(
      "### [threadId=PRRT_linked](https://github.com/owner/repo/pull/1#discussion_r1) — `src/x.ts:5` (@reviewer · Unknown)",
    );
    expect(out).toContain(
      "### [commentId=PRRC_linked](https://github.com/owner/repo/pull/1#issuecomment-1) (@bob · Unknown)",
    );
    expect(out).not.toContain("### `PRRT_linked`");
    expect(out).not.toContain("### `PRRC_linked`");
  });
  it("fix_code: cancelled check renders [conclusion: CANCELLED] tag without failedStep/summary", async () => {
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code") {
      throw new Error("unreachable");
    }
    result.fix.checks = [
      {
        name: "tests",
        runId: "run-99",
        detailsUrl: null,
        conclusion: "CANCELLED" as const,
        failedStep: "Run tests",
        summary: "3 tests failed",
      },
    ];
    mockRunIterate.mockResolvedValue(result);

    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    // Cancelled check emits [conclusion: CANCELLED] tag
    expect(out).toContain("- `run-99` — `tests` [conclusion: CANCELLED]");
    // failedStep and summary are suppressed for cancelled checks
    expect(out).not.toContain("> Run tests");
    expect(out).not.toContain("> 3 tests failed");
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
  it("fix_code: ## In-progress runs renders before ## Cancelled runs; absent when empty", async () => {
    const result = makeIterateResult("fix_code");
    if (result.action !== "fix_code") throw new Error("unreachable");
    result.fix = {
      ...result.fix,
      inProgressRunIds: ["run-in-1"],
      instructions: [
        "Cancel in-progress CI runs first: for each ID under `## In-progress runs`.",
        "Apply code fixes.",
      ],
    };
    result.cancelled = ["run-cancelled-1"];
    mockRunIterate.mockResolvedValue(result);
    await main(["node", "shepherd", "iterate", "42"]);
    const out = getStdout();
    expect(out).toContain("## In-progress runs");
    expect(out).toContain("- `run-in-1`");
    expect(out.indexOf("## In-progress runs")).toBeLessThan(out.indexOf("## Cancelled runs"));
    expect(out).toMatch(/1\. Cancel in-progress CI runs first/);
    result.fix = { ...result.fix, inProgressRunIds: [], instructions: ["Apply code fixes."] };
    mockRunIterate.mockResolvedValue(result);
    vi.clearAllMocks();
    await main(["node", "shepherd", "iterate", "42"]);
    expect(getStdout()).not.toContain("## In-progress runs");
  });
});
