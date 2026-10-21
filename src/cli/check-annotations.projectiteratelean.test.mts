import { describe, expect, it } from "vitest";

import { makeIterateResult } from "../../fixtures/cli-parser.iterate-fixtures.mts";
import { projectIterateLean } from "./iterate-lean.mts";
import type { IterateResult } from "../types.mts";

describe("projectIterateLean — check annotations", () => {
  it("keeps annotations on triage.checks", () => {
    const result: IterateResult = { ...makeIterateResult("triage") };
    if (result.action !== "triage") throw new Error("expected triage fixture");
    result.triage.checks = [
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

    const lean = projectIterateLean(result) as { triage: { checks: unknown[] } };

    expect(lean.triage.checks).toEqual(result.triage.checks);
  });
});
