import { describe, it, expect } from "vitest";
import {
  registerHooks,
  getStdout,
  mockRunMarkFilesAsViewed,
  stderrSpy,
} from "./cli-parser.test-support.mts";
import { main } from "./cli-parser.mts";

registerHooks();

const BASE_RESULT = {
  repo: "owner/repo",
  prNumber: 42,
  pullRequestId: "PR_1",
  requestedPaths: [],
  testSelector: false,
  matchPatterns: [],
  matchedPaths: [],
  markedPaths: [],
  alreadyViewedPaths: [],
  missingPaths: [],
  unmatchedSelectors: [],
  errors: [],
};

describe("main — mark-files-as-viewed", () => {
  it("passes exact paths and selectors to runMarkFilesAsViewed", async () => {
    mockRunMarkFilesAsViewed.mockResolvedValue({
      ...BASE_RESULT,
      requestedPaths: ["src/a.ts"],
      testSelector: true,
      matchPatterns: ["docs"],
      matchedPaths: ["src/a.ts"],
      markedPaths: ["src/a.ts"],
    });

    await main([
      "node",
      "shepherd",
      "mark-files-as-viewed",
      "42",
      "src/a.ts",
      "--tests",
      "--match",
      "docs",
    ]);

    expect(mockRunMarkFilesAsViewed).toHaveBeenCalledWith({
      format: "text",
      verbose: false,
      prNumber: 42,
      files: ["src/a.ts"],
      tests: true,
      matchPatterns: ["docs"],
    });
    expect(getStdout()).toContain("Marked viewed (1)");
  });

  it("emits JSON when requested", async () => {
    mockRunMarkFilesAsViewed.mockResolvedValue({
      ...BASE_RESULT,
      matchedPaths: ["src/a.test.ts"],
      markedPaths: ["src/a.test.ts"],
    });

    await main(["node", "shepherd", "mark-files-as-viewed", "42", "--tests", "--format=json"]);

    expect(JSON.parse(getStdout())).toMatchObject({ prNumber: 42, markedPaths: ["src/a.test.ts"] });
  });

  it("rejects missing selectors", async () => {
    await main(["node", "shepherd", "mark-files-as-viewed", "42"]);

    expect(mockRunMarkFilesAsViewed).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalledWith(
      "pr-shepherd: mark-files-as-viewed: provide at least one file, --tests, or --match <regex>\n",
    );
    expect(process.exitCode).toBe(1);
  });
});
