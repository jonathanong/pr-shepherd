import { describe, expect, it } from "vitest";

import { formatIterateResult } from "./iterate-formatter.mts";
import { makeIterateResult } from "../../fixtures/cli-parser.iterate-fixtures.mts";
import type { IterateResult } from "../types.mts";

describe("## Check annotations — trivial drop and log dedup", () => {
  it("omits the whole section when every annotation is a bare exit-code message", () => {
    const result: IterateResult = { ...makeIterateResult("fix_code") };
    if (result.action !== "fix_code") throw new Error("expected fix_code fixture");
    result.fix.checks = [
      {
        name: "build",
        runId: "1",
        detailsUrl: null,
        conclusion: "FAILURE",
        annotations: [
          {
            id: "check_annotation_a",
            path: ".github",
            startLine: 18,
            endLine: 18,
            level: "FAILURE",
            message: "Process completed with exit code 1.",
          },
        ],
      },
    ];

    const output = formatIterateResult(result);

    expect(output).not.toContain("## Check annotations");
  });

  it("keeps a check's other annotations and heading when only one is trivial", () => {
    const result: IterateResult = { ...makeIterateResult("fix_code") };
    if (result.action !== "fix_code") throw new Error("expected fix_code fixture");
    result.fix.checks = [
      {
        name: "build",
        runId: "1",
        detailsUrl: null,
        conclusion: "FAILURE",
        annotations: [
          {
            id: "check_annotation_a",
            path: ".github",
            startLine: 18,
            endLine: 18,
            level: "FAILURE",
            message: "Process completed with exit code 1.",
          },
          {
            id: "check_annotation_b",
            path: "src/foo.mts",
            startLine: 5,
            endLine: 5,
            level: "WARNING",
            message: "Unused variable",
          },
        ],
      },
    ];

    const output = formatIterateResult(result);

    expect(output).toContain("## Check annotations");
    expect(output).not.toContain("check_annotation_a");
    expect(output).toContain("check_annotation_b");
    expect(output).toContain("> Unused variable");
  });

  it("suppresses an annotation body that duplicates the check's log excerpt", () => {
    const result: IterateResult = { ...makeIterateResult("fix_code") };
    if (result.action !== "fix_code") throw new Error("expected fix_code fixture");
    result.fix.checks = [
      {
        name: "tests",
        runId: "1",
        detailsUrl: null,
        conclusion: "FAILURE",
        logExcerpt: "...\nAssertionError: expected undefined to be defined\n...",
        annotations: [
          {
            id: "check_annotation_dup",
            path: "src/foo.test.mts",
            startLine: 102,
            endLine: 102,
            level: "FAILURE",
            message: "AssertionError: expected undefined to be defined",
          },
        ],
      },
    ];

    const output = formatIterateResult(result);
    const annotationsSection = output.slice(output.indexOf("## Check annotations"));

    expect(annotationsSection).toContain("`check_annotation_dup`");
    expect(annotationsSection).not.toContain("AssertionError");
    expect(output).toContain("> AssertionError: expected undefined to be defined");
    expect(output.split("AssertionError").length - 1).toBe(1);
  });
});
