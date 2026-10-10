import { describe, expect, it } from "vitest";

import { mapCheckRunNode } from "./batch-parser-helpers.mts";
import type { RawContextNode } from "./batch-raw-types.mts";

type CheckRunNode = Extract<RawContextNode, { __typename: "CheckRun" }>;

const full = {
  fullDatabaseId: "42",
  path: "src/a.mts",
  annotationLevel: "FAILURE",
  title: "lint",
  message: "boom",
  rawDetails: null,
  blobUrl: "https://example.test/blob",
  location: { start: { line: 3, column: null }, end: { line: 4, column: null } },
};

function node(annotations: CheckRunNode["annotations"]): CheckRunNode {
  return {
    __typename: "CheckRun",
    id: "CR_1",
    name: "lint",
    status: "COMPLETED",
    conclusion: "FAILURE",
    detailsUrl: null,
    title: null,
    summary: null,
    checkSuite: null,
    ...(annotations !== undefined && { annotations }),
  };
}

describe("mapCheckRunNode inline annotations", () => {
  it("converts a complete single-annotation page", () => {
    const run = mapCheckRunNode(node({ totalCount: 1, nodes: [full] }));

    expect(run.hasAnnotations).toBe(true);
    expect(run.inlineAnnotations).toEqual([
      {
        id: "check_annotation_42",
        path: "src/a.mts",
        startLine: 3,
        endLine: 4,
        startColumn: null,
        endColumn: null,
        level: "FAILURE",
        title: "lint",
        message: "boom",
        blobUrl: "https://example.test/blob",
      },
    ]);
  });

  it("defaults omitted nullable fields", () => {
    const { title: _t, rawDetails: _r, blobUrl: _b, ...rest } = full;
    const run = mapCheckRunNode(node({ totalCount: 1, nodes: [rest] }));

    expect(run.inlineAnnotations?.[0]).not.toHaveProperty("title");
    expect(run.inlineAnnotations?.[0]).not.toHaveProperty("blobUrl");
  });

  it.each([
    ["no annotations", undefined],
    ["no total", { nodes: [full] }],
    ["zero total", { totalCount: 0, nodes: [] }],
    ["a partial page", { totalCount: 2, nodes: [full] }],
    ["a message-only node", { totalCount: 1, nodes: [{ message: "boom" }] }],
    ["a node without location", { totalCount: 1, nodes: [{ ...full, location: undefined }] }],
    ["a node without an id", { totalCount: 1, nodes: [{ ...full, fullDatabaseId: undefined }] }],
  ])("omits inline annotations for %s", (_label, annotations) => {
    const run = mapCheckRunNode(node(annotations as CheckRunNode["annotations"]));

    expect(run).not.toHaveProperty("inlineAnnotations");
  });
});
