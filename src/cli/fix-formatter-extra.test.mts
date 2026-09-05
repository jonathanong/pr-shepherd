import { describe, expect, it } from "vitest";
import type { CheckAnnotation } from "../types.mts";
import { renderCheckAnnotation, renderProtectedRun } from "./fix-formatter-extra.mts";

describe("renderCheckAnnotation", () => {
  it("renders unknown locations without optional annotation details", () => {
    const annotation: CheckAnnotation = {
      id: "ann-1",
      path: "src/index.mts",
      startLine: null,
      endLine: null,
      level: "WARNING",
      message: "",
    };

    expect(renderCheckAnnotation(annotation)).toBe("- `ann-1` `src/index.mts:?` [WARNING]");
  });

  it("renders ranges, links, titles, messages, and raw details", () => {
    const annotation: CheckAnnotation = {
      id: "ann-2",
      path: "src/index.mts",
      startLine: 10,
      endLine: 12,
      level: "FAILURE",
      message: "message body",
      rawDetails: "raw details",
      title: "Type error",
      blobUrl: "https://github.test/blob",
    };

    expect(renderCheckAnnotation(annotation)).toBe(
      [
        "- `ann-2` [↗](https://github.test/blob) `src/index.mts:10-12` [FAILURE] — Type error",
        "> message body",
        "> raw details",
      ].join("\n"),
    );
  });

  it("drops a bare exit-code message entirely", () => {
    const annotation: CheckAnnotation = {
      id: "ann-3",
      path: ".github",
      startLine: 18,
      endLine: 18,
      level: "FAILURE",
      message: "Process completed with exit code 1.",
    };

    expect(renderCheckAnnotation(annotation)).toBeNull();
  });

  it("keeps a titled exit-code annotation instead of dropping it entirely", () => {
    const annotation: CheckAnnotation = {
      id: "ann-title",
      path: ".github",
      startLine: 18,
      endLine: 18,
      level: "FAILURE",
      title: "Build step failed",
      message: "Process completed with exit code 1.",
    };

    const output = renderCheckAnnotation(annotation);

    expect(output).not.toBeNull();
    expect(output).toContain("— Build step failed");
  });

  it("keeps an exit-code message alongside real raw details", () => {
    const annotation: CheckAnnotation = {
      id: "ann-4",
      path: ".github",
      startLine: 18,
      endLine: 18,
      level: "FAILURE",
      message: "Process completed with exit code 1.",
      rawDetails: "see step 'Run tests' for the failing assertion",
    };

    expect(renderCheckAnnotation(annotation)).toContain(
      "> see step 'Run tests' for the failing assertion",
    );
  });

  it("drops only the body when it duplicates the check's log excerpt, keeping the bullet", () => {
    const annotation: CheckAnnotation = {
      id: "ann-5",
      path: "src/foo.test.mts",
      startLine: 102,
      endLine: 102,
      level: "FAILURE",
      message: "AssertionError: expected undefined to be defined",
      blobUrl: "https://github.test/blob",
    };
    const logExcerpt = "...\nAssertionError: expected undefined to be defined\n...";

    const output = renderCheckAnnotation(annotation, logExcerpt);

    expect(output).toContain("- `ann-5` [↗](https://github.test/blob) `src/foo.test.mts:102`");
    expect(output).not.toContain("> AssertionError");
  });

  it("keeps the body when it does not appear in the check's log excerpt", () => {
    const annotation: CheckAnnotation = {
      id: "ann-6",
      path: "src/foo.test.mts",
      startLine: 102,
      endLine: 102,
      level: "FAILURE",
      message: "AssertionError: expected undefined to be defined",
    };

    expect(renderCheckAnnotation(annotation, "unrelated log content")).toContain(
      "> AssertionError: expected undefined to be defined",
    );
  });
});

describe("renderProtectedRun", () => {
  it("renders protected workflow runs with workflow context when present", () => {
    expect(
      renderProtectedRun({
        runId: "run-1",
        matchedPattern: "Final Code Review",
        checkNames: ["reviewdog"],
        workflowName: "Final Code Review",
      }),
    ).toBe("- `run-1` — `Final Code Review (reviewdog)` [matched: `Final Code Review`]");
  });

  it("renders protected workflow runs without workflow context", () => {
    expect(
      renderProtectedRun({
        runId: "run-2",
        matchedPattern: "review*",
        checkNames: ["reviewdog", "lint"],
      }),
    ).toBe("- `run-2` — `reviewdog, lint` [matched: `review*`]");
  });
});
