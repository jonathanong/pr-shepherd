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
  "detect-changes": {
    "result": "success",
    "outputs": {}
  },
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
    const excerpt = result?.logExcerpt;
    expect(excerpt).toContain("One or more required jobs failed or were cancelled");
    expect(excerpt).toContain("##[error]Process completed with exit code 1.");
    expect(excerpt).toContain("Job results (non-success):");
    expect(excerpt).toContain("test-playwright: failure");
    expect(excerpt).toContain("test-playwright-credentialed: failure");
    expect(excerpt).not.toContain("detect-changes");
    expect(excerpt).not.toContain("2026-06-11T05:06:34");
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

  it("anchors log excerpts on generic failure lines when explicit error markers are absent", async () => {
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
        makeTextResponse(`setup line
useful context before failure
One or more required jobs failed or were cancelled
cleanup after failure`),
      );

    const [result] = await triageFailingChecks([makeCheck({ name: "tests" })], REPO);

    expect(result!.logExcerpt).toContain("useful context before failure");
    expect(result!.logExcerpt).toContain("One or more required jobs failed or were cancelled");
    expect(result!.logExcerpt).toContain("cleanup after failure");
  });

  it("preserves the anchor line when the selected excerpt is truncated", async () => {
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
        makeTextResponse(`${"verbose setup ".repeat(500)}
##[error]Process completed with exit code 1.
${"cleanup after failure ".repeat(500)}`),
      );

    const [result] = await triageFailingChecks([makeCheck({ name: "tests" })], REPO);

    expect(result?.logExcerpt).toContain("##[error]Process completed with exit code 1.");
    expect(result?.logExcerpt).toContain("[truncated]");
  });

  it("falls back to anchored excerpts when aggregate job results are malformed", async () => {
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
        makeTextResponse(`Job results: { not json }
##[error]Process completed with exit code 1.`),
      );

    const [result] = await triageFailingChecks([makeCheck({ name: "tests" })], REPO);

    expect(result?.logExcerpt).toContain("Job results: { not json }");
    expect(result?.logExcerpt).toContain("##[error]Process completed with exit code 1.");
  });
});
