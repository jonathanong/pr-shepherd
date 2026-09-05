import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockLoadConfig } = vi.hoisted(() => ({ mockLoadConfig: vi.fn() }));
vi.mock("../config/load.mts", () => ({ loadConfig: mockLoadConfig }));

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

function config(ignoreLogLines: string[] = []) {
  return { checks: { ignoreLogLines } };
}

beforeEach(() => {
  mockLoadConfig.mockReturnValue(config());
});

const SAMPLE_LOG = [
  "useful context before failure",
  "##[error]AssertionError: expected undefined to be defined",
  "⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯",
  "Duration  73.73s (transform 4.31s, setup 2.90s)",
  "cleanup after failure",
].join("\n");

function mockJobAndLog(): void {
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
    .mockResolvedValueOnce(makeTextResponse(SAMPLE_LOG));
}

describe("triageFailingChecks — log excerpt noise stripping (checks.ignoreLogLines)", () => {
  it("strips nothing by default — Shepherd ships no built-in noise patterns", async () => {
    mockJobAndLog();

    const [result] = await triageFailingChecks([makeCheck({ name: "tests" })], REPO);

    const excerpt = result?.logExcerpt;
    expect(excerpt).toContain("⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯");
    expect(excerpt).toContain("Duration  73.73s (transform 4.31s, setup 2.90s)");
  });

  it("drops lines matching a configured checks.ignoreLogLines pattern", async () => {
    mockLoadConfig.mockReturnValue(config(["^⎯{3,}", "^Duration\\s"]));
    mockJobAndLog();

    const [result] = await triageFailingChecks([makeCheck({ name: "tests" })], REPO);

    const excerpt = result?.logExcerpt;
    expect(excerpt).toContain("useful context before failure");
    expect(excerpt).toContain("##[error]AssertionError: expected undefined to be defined");
    expect(excerpt).toContain("cleanup after failure");
    expect(excerpt).not.toContain("⎯");
    expect(excerpt).not.toContain("Duration");
  });
});
