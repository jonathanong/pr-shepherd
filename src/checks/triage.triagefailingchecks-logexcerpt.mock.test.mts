import { describe, it, expect } from "vitest";
import {
  registerHooks,
  REPO,
  makeCheck,
  makeErrorResponse,
  makeJobsResponse,
  makeTextResponse,
  mockFetch,
  triageFailingChecks,
} from "../../test-helpers/checks/triage.test-support.mts";

registerHooks();

describe("triageFailingChecks — logExcerpt", () => {
  it("attaches a bounded failed job log excerpt when the matched job has logs", async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeJobsResponse([
          {
            id: 80724572207,
            name: "tests",
            workflow_name: "CI",
            conclusion: "failure",
            steps: [{ name: "All checks passed", number: 8, conclusion: "failure" }],
          },
        ]),
      )
      .mockResolvedValueOnce(
        makeTextResponse(`2026-06-11T05:06:34.1609226Z Job results: {
  "test-playwright": {
    "result": "failure",
    "outputs": {}
  },
  "test-playwright-credentialed": {
    "result": "failure",
    "outputs": {}
  }
}
2026-06-11T05:06:34.1626686Z One or more required jobs failed or were cancelled
2026-06-11T05:06:34.1638658Z ##[error]Process completed with exit code 1.`),
      );

    const [result] = await triageFailingChecks([makeCheck({ name: "tests" })], REPO);

    expect(result).toEqual(
      expect.objectContaining({
        workflowName: "CI",
        jobName: "tests",
        failedStep: "All checks passed",
      }),
    );
    expect(result!.logExcerpt).toContain('"test-playwright"');
    expect(result!.logExcerpt).toContain('"test-playwright-credentialed"');
    expect(result!.logExcerpt).toContain("One or more required jobs failed or were cancelled");
    expect(result!.logExcerpt).toContain("##[error]Process completed with exit code 1.");
    expect(result!.logExcerpt).not.toContain("2026-06-11T05:06:34");
    expect(mockFetch.mock.calls[1]?.[0]).toContain("/actions/jobs/80724572207/logs");
  });

  it("keeps normal triage fields when fetching the matched job log fails", async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeJobsResponse([
          {
            id: 80724572207,
            name: "tests",
            workflow_name: "CI",
            conclusion: "failure",
            steps: [{ name: "All checks passed", number: 8, conclusion: "failure" }],
          },
        ]),
      )
      .mockResolvedValueOnce(makeErrorResponse(404));

    const [result] = await triageFailingChecks([makeCheck({ name: "tests" })], REPO);

    expect(result).toEqual(
      expect.objectContaining({
        workflowName: "CI",
        jobName: "tests",
        failedStep: "All checks passed",
      }),
    );
    expect(result).not.toHaveProperty("logExcerpt");
  });
});
