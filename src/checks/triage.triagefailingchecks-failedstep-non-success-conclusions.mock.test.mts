import { describe, it, expect } from "vitest";
import {
  registerHooks,
  REPO,
  makeCheck,
  makeJobsResponse,
  mockFetch,
  triageFailingChecks,
} from "./triage.test-support.mts";

registerHooks();

describe("triageFailingChecks — failedStep non-success conclusions", () => {
  it("captures timed_out step as failedStep", async () => {
    mockFetch.mockResolvedValueOnce(
      makeJobsResponse([
        {
          name: "tests",
          conclusion: "timed_out",
          steps: [
            { name: "Set up job", number: 1, conclusion: "success" },
            { name: "Run tests", number: 2, conclusion: "timed_out" },
          ],
        },
      ]),
    );
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "TIMED_OUT" })], REPO);
    expect(result!.failedStep).toBe("Run tests");
  });

  it("skips skipped/neutral steps, captures the first genuinely failed step", async () => {
    mockFetch.mockResolvedValueOnce(
      makeJobsResponse([
        {
          name: "tests",
          conclusion: "failure",
          steps: [
            { name: "Check cache", number: 1, conclusion: "skipped" },
            { name: "Run lint", number: 2, conclusion: "neutral" },
            { name: "Run tests", number: 3, conclusion: "failure" },
          ],
        },
      ]),
    );
    const [result] = await triageFailingChecks([makeCheck()], REPO);
    expect(result!.failedStep).toBe("Run tests");
  });
});
