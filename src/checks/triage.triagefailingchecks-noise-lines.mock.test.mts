import { describe, it, expect } from "vitest";
import {
  registerHooks,
  REPO,
  makeCheck,
  makeJobsResponse,
  makeTextResponse,
  mockFetch,
  triageFailingChecks,
} from "../../test-helpers/checks/triage.test-support.mts";

registerHooks();

describe("triageFailingChecks — log excerpt noise stripping", () => {
  it("drops vitest-teardown, report-written, duration, and rule-divider lines", async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeJobsResponse([
          {
            id: 80724572207,
            name: "tests",
            conclusion: "failure",
            steps: [{ name: "All checks passed", number: 8, conclusion: "failure" }],
          },
        ]),
      )
      .mockResolvedValueOnce(
        makeTextResponse(
          [
            "useful context before failure",
            "##[error]AssertionError: expected undefined to be defined",
            "⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯",
            "Test Files  1 failed | 242 passed (243)",
            "Duration  73.73s (transform 4.31s, setup 2.90s)",
            "Start at  14:31:17",
            "blob report written to /home/runner/_work/repo/.vitest-reports/shard-4.json",
            "JUNIT report written to /home/runner/_work/repo/test-report.junit.xml",
            "[vitest-teardown] phase=queues start",
            "[vitest-teardown] phase=queues done ms=130",
            "cleanup after failure",
          ].join("\n"),
        ),
      );

    const [result] = await triageFailingChecks([makeCheck({ name: "tests" })], REPO);

    const excerpt = result?.logExcerpt;
    expect(excerpt).toContain("useful context before failure");
    expect(excerpt).toContain("##[error]AssertionError: expected undefined to be defined");
    expect(excerpt).toContain("cleanup after failure");
    expect(excerpt).toContain("Test Files  1 failed | 242 passed (243)");
    expect(excerpt).not.toContain("⎯");
    expect(excerpt).not.toContain("Duration");
    expect(excerpt).not.toContain("Start at");
    expect(excerpt).not.toContain("blob report written to");
    expect(excerpt).not.toContain("JUNIT report written to");
    expect(excerpt).not.toContain("[vitest-teardown]");
  });
});
