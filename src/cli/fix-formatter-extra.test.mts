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
