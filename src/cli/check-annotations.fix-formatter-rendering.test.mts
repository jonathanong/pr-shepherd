import { describe, expect, it } from "vitest";

import { formatIterateResult } from "./iterate-formatter.mts";
import { makeIterateResult } from "../../fixtures/cli-parser.iterate-fixtures.mts";
import type { IterateResult } from "../types.mts";

describe("## Check annotations — fix formatter rendering", () => {
  it("renders failing check log excerpts as indented blockquotes", () => {
    const result: IterateResult = { ...makeIterateResult("fix_code") };
    if (result.action !== "fix_code") throw new Error("expected fix_code fixture");
    result.fix.checks = [
      {
        name: "tests",
        runId: "27325033780",
        detailsUrl: "https://github.com/owner/repo/actions/runs/27325033780/job/80724572207",
        conclusion: "FAILURE",
        workflowName: "CI",
        jobName: "tests",
        failedStep: "All checks passed",
        logExcerpt:
          '"test-playwright": {"result": "failure"}\n"test-playwright-credentialed": {"result": "failure"}',
      },
    ];

    const output = formatIterateResult(result);

    expect(output).toContain("- `27325033780` — `CI › tests` [conclusion: FAILURE]");
    expect(output).toContain("  > All checks passed");
    expect(output).toContain('  > "test-playwright": {"result": "failure"}');
    expect(output).toContain('  > "test-playwright-credentialed": {"result": "failure"}');
  });

  it("renders check annotations after failing checks", () => {
    const result: IterateResult = { ...makeIterateResult("fix_code") };
    if (result.action !== "fix_code") throw new Error("expected fix_code fixture");
    result.fix.checks = [
      {
        name: "SonarCloud Code Analysis",
        runId: null,
        detailsUrl: "https://sonarcloud.io",
        conclusion: "FAILURE",
        summary: "Quality Gate failed",
        annotations: [
          {
            id: "check_annotation_56040842845",
            path: "src/cli/default-poll.mts",
            startLine: 36,
            endLine: 36,
            level: "WARNING",
            title: "This assertion is unnecessary",
            message: "Remove the assertion.",
            blobUrl: "https://github.example/blob",
          },
          {
            id: "check_annotation_56040842876",
            path: "src/commands/poll.mts",
            startLine: 19,
            endLine: 21,
            level: "WARNING",
            message: "",
            rawDetails: "Prefer separate methods.",
          },
          {
            id: "check_annotation_no_location",
            path: "src/unknown.mts",
            startLine: null,
            endLine: null,
            level: "NOTICE",
            message: "No location available.",
          },
        ],
      },
    ];

    const output = formatIterateResult(result);

    expect(output).toContain("## Failing checks");
    expect(output).toContain("## Check annotations");
    expect(output.indexOf("## Check annotations")).toBeGreaterThan(
      output.indexOf("## Failing checks"),
    );
    expect(output).toContain(
      "- `check_annotation_56040842845` [↗](https://github.example/blob) `src/cli/default-poll.mts:36` [WARNING] — This assertion is unnecessary",
    );
    expect(output).toContain("> Remove the assertion.");
    expect(output).toContain(
      "- `check_annotation_56040842876` `src/commands/poll.mts:19-21` [WARNING]",
    );
    expect(output).toContain("> Prefer separate methods.");
    expect(output).toContain("- `check_annotation_no_location` `src/unknown.mts:?` [NOTICE]");
  });
});
