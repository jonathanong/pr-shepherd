import { describe, expect, it } from "vitest";

import { makeIterateResult } from "../../fixtures/cli-parser.iterate-fixtures.mts";
import { projectIterateLean } from "./iterate-lean.mts";
import type { IterateResult } from "../types.mts";

describe("projectIterateLean — check annotations", () => {
  it("keeps annotations on fix.checks", () => {
    const result: IterateResult = { ...makeIterateResult("fix_code") };
    if (result.action !== "fix_code") throw new Error("expected fix_code fixture");
    result.fix.checks = [
      {
        name: "SonarCloud Code Analysis",
        runId: null,
        detailsUrl: "https://sonarcloud.io",
        conclusion: "FAILURE",
        annotations: [
          {
            id: "check_annotation_1",
            path: "src/foo.mts",
            startLine: 1,
            endLine: 1,
            level: "WARNING",
            message: "Fix this.",
          },
        ],
      },
    ];

    const lean = projectIterateLean(result) as { fix: { checks: unknown[] } };

    expect(lean.fix.checks).toEqual(result.fix.checks);
  });
});
