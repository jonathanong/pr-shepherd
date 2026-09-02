import { describe, it, expect } from "vitest";
import {
  registerHooks,
  REPO,
  makeCheck,
  makeJobsResponse,
  mockFetch,
  triageFailingChecks,
} from "../../test-helpers/checks/triage.test-support.mts";

registerHooks();

describe("triageFailingChecks — CANCELLED attempt metadata", () => {
  it("fetches the run attempt without fetching a log excerpt", async () => {
    mockFetch.mockResolvedValueOnce(
      makeJobsResponse([{ id: 10, name: "tests", conclusion: "cancelled", run_attempt: 2 }]),
    );
    const check = makeCheck({ conclusion: "CANCELLED" });
    const [result] = await triageFailingChecks([check], REPO);
    expect(result!.conclusion).toBe("CANCELLED");
    expect(result!.runAttempt).toBe(2);
    expect(result!.failedStep).toBeUndefined();
    expect(result!.logExcerpt).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
