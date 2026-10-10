import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClassifiedCheck } from "../types.mts";

vi.mock("../github/client.mts", () => ({ graphql: vi.fn() }));

import { attachAndMergeCheckAnnotations as operation } from "./check-annotations.mts";
import { runWithGithubTransport } from "../github/transport.mts";
const attachAndMergeCheckAnnotations = (...args: Parameters<typeof operation>) =>
  runWithGithubTransport("graphql", () => operation(...args));
import { graphql } from "../github/client.mts";
import { CHECK_RUN_ANNOTATIONS_BATCH_QUERY } from "../github/queries.mts";

const mockGraphql = vi.mocked(graphql);

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function check(id: string): ClassifiedCheck {
  return {
    id,
    name: `unit ${id}`,
    status: "COMPLETED",
    conclusion: "SUCCESS",
    detailsUrl: "",
    event: "pull_request",
    runId: null,
    category: "passed",
    hasAnnotations: true,
  };
}

function checkNode(id: string, message: string) {
  return {
    id,
    __typename: "CheckRun",
    annotations: {
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [
        {
          fullDatabaseId: "200",
          path: "src/a.mts",
          annotationLevel: "WARNING",
          title: null,
          message,
          rawDetails: null,
          blobUrl: null,
          location: null,
        },
      ],
    },
  };
}

function attach(list: ClassifiedCheck[]) {
  return attachAndMergeCheckAnnotations(
    { passing: list, failing: [], skipped: [], filtered: [], ignored: [] },
    new Map(),
    7,
  );
}

describe("inline BatchPr annotations", () => {
  function inlineCheck(id: string, message: string): ClassifiedCheck {
    return {
      ...check(id),
      inlineAnnotations: [
        {
          id: "check_annotation_100",
          path: "src/a.mts",
          startLine: null,
          endLine: null,
          level: "WARNING",
          message,
        },
      ],
    };
  }

  it("uses inline annotations without a batch read and strips the internal field", async () => {
    const result = await attach([inlineCheck("CR_acme_1", "inline")]);

    expect(mockGraphql).not.toHaveBeenCalled();
    expect(result.passing[0]?.annotations?.[0]?.message).toBe("inline");
    expect(result.passing[0]).not.toHaveProperty("inlineAnnotations");
  });

  it("reads only the runs without inline annotations", async () => {
    mockGraphql.mockResolvedValueOnce({ data: { nodes: [checkNode("CR_acme_2", "fetched")] } });

    const result = await attach([inlineCheck("CR_acme_1", "inline"), check("CR_acme_2")]);

    expect(mockGraphql).toHaveBeenCalledTimes(1);
    expect(mockGraphql).toHaveBeenCalledWith(
      CHECK_RUN_ANNOTATIONS_BATCH_QUERY,
      { ids: ["CR_acme_2"] },
      { allowPartialData: true },
    );
    expect(result.passing.map((c) => c.annotations?.[0]?.message)).toEqual(["inline", "fetched"]);
  });

  it("keeps inline annotations when the batch read for other runs fails", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    mockGraphql.mockImplementation(async () => {
      throw new Error("resource not accessible");
    });

    const result = await attach([inlineCheck("CR_acme_1", "inline"), check("CR_acme_2")]);

    expect(result.passing[0]?.annotations?.[0]?.message).toBe("inline");
    expect(result.passing[1]?.annotations).toBeUndefined();
  });

  it("filters seen inline annotations and strips non-candidate inline fields", async () => {
    const seen = new Map([["check_annotation_100", { seenAt: 1 }]]);
    const running = { ...inlineCheck("CR_acme_2", "running"), status: "IN_PROGRESS" as const };
    const result = await attachAndMergeCheckAnnotations(
      {
        passing: [inlineCheck("CR_acme_1", "seen")],
        failing: [],
        skipped: [running],
        filtered: [],
        ignored: [],
      },
      seen,
      7,
    );

    expect(mockGraphql).not.toHaveBeenCalled();
    expect(result.passing[0]?.annotations).toBeUndefined();
    expect(result.passing[0]).not.toHaveProperty("inlineAnnotations");
    expect(result.skipped[0]).not.toHaveProperty("inlineAnnotations");
  });
});
