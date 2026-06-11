/* eslint-disable max-lines */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client.mts", () => ({ graphql: vi.fn() }));

import { graphql } from "./client.mts";
import { fetchCheckRunAnnotations } from "./check-annotations.mts";

const mockGraphql = vi.mocked(graphql);

beforeEach(() => vi.clearAllMocks());

describe("fetchCheckRunAnnotations", () => {
  function rawAnnotation(overrides: Record<string, unknown> = {}) {
    return {
      fullDatabaseId: null,
      path: "src/a.mts",
      annotationLevel: "FAILURE",
      title: "",
      message: "message",
      rawDetails: null,
      blobUrl: null,
      location: null,
      ...overrides,
    };
  }

  function mockPage(nodes: unknown[], hasNextPage = false, endCursor: string | null = null) {
    mockGraphql.mockResolvedValueOnce({
      data: {
        node: {
          __typename: "CheckRun",
          annotations: {
            pageInfo: { hasNextPage, endCursor },
            nodes,
          },
        },
      },
    });
  }

  it("maps annotation fields and prefixes fullDatabaseId", async () => {
    mockPage([
      {
        fullDatabaseId: "56040842845",
        path: "src/cli/default-poll.mts",
        annotationLevel: "WARNING",
        title: "This assertion is unnecessary",
        message: "Remove the assertion.",
        rawDetails: "details",
        blobUrl: "https://github.example/blob",
        location: {
          start: { line: 36, column: null },
          end: { line: 36, column: null },
        },
      },
    ]);

    await expect(fetchCheckRunAnnotations("CR_123")).resolves.toEqual([
      {
        id: "check_annotation_56040842845",
        path: "src/cli/default-poll.mts",
        startLine: 36,
        endLine: 36,
        startColumn: null,
        endColumn: null,
        level: "WARNING",
        title: "This assertion is unnecessary",
        message: "Remove the assertion.",
        rawDetails: "details",
        blobUrl: "https://github.example/blob",
      },
    ]);
  });

  it("includes rendered optional fields in fallback IDs", async () => {
    mockPage([
      rawAnnotation({
        message: "same",
        rawDetails: "first details",
        blobUrl: "https://github.example/first",
      }),
      rawAnnotation({
        message: "same",
        rawDetails: "second details",
        blobUrl: "https://github.example/second",
      }),
    ]);

    const result = await fetchCheckRunAnnotations("CR_123");

    expect(result).toHaveLength(2);
    expect(result.map((a) => a.id)).toEqual([
      expect.stringMatching(/^check_annotation_[0-9a-f]{24}$/),
      expect.stringMatching(/^check_annotation_[0-9a-f]{24}$/),
    ]);
    expect(result[0]?.id).not.toBe(result[1]?.id);
  });

  it("bounds annotation message and raw details text", async () => {
    mockPage([
      rawAnnotation({
        message: `${"a".repeat(4_200)} fromJSON`,
        rawDetails: `${"b".repeat(4_200)} runs-on`,
      }),
    ]);

    const [result] = await fetchCheckRunAnnotations("CR_123");

    expect(result!.message).toHaveLength(4_000);
    expect(result!.message.endsWith("[truncated]")).toBe(true);
    expect(result!.message).not.toContain("fromJSON");
    expect(result!.rawDetails).toHaveLength(4_000);
    expect(result!.rawDetails!.endsWith("[truncated]")).toBe(true);
    expect(result!.rawDetails).not.toContain("runs-on");
  });

  it("paginates annotations and hashes fallback IDs", async () => {
    mockGraphql
      .mockResolvedValueOnce({
        data: {
          node: {
            __typename: "CheckRun",
            annotations: {
              pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
              nodes: [
                {
                  fullDatabaseId: null,
                  path: "src/a.mts",
                  annotationLevel: "FAILURE",
                  title: "",
                  message: "first",
                  rawDetails: null,
                  blobUrl: null,
                  location: null,
                },
              ],
            },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          node: {
            __typename: "CheckRun",
            annotations: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [
                {
                  fullDatabaseId: "2",
                  path: "src/b.mts",
                  annotationLevel: "WARNING",
                  title: null,
                  message: "second",
                  rawDetails: null,
                  blobUrl: null,
                  location: {
                    start: { line: 1, column: 2 },
                    end: { line: 3, column: 4 },
                  },
                },
              ],
            },
          },
        },
      });

    const result = await fetchCheckRunAnnotations("CR_123");

    expect(result).toHaveLength(2);
    expect(result[0]?.id).toMatch(/^check_annotation_[0-9a-f]{24}$/);
    expect(result[1]).toMatchObject({
      id: "check_annotation_2",
      startLine: 1,
      endLine: 3,
      startColumn: 2,
      endColumn: 4,
    });
    expect(mockGraphql).toHaveBeenNthCalledWith(2, expect.any(String), {
      id: "CR_123",
      cursor: "cursor-1",
    });
  });

  it("caps annotation pagination and warns when the cap is reached", async () => {
    const errSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    for (let page = 1; page <= 10; page++) {
      mockPage([rawAnnotation({ message: `page ${page}` })], true, `cursor-${page}`);
    }

    const result = await fetchCheckRunAnnotations("CR_lots");

    expect(result).toHaveLength(10);
    expect(mockGraphql).toHaveBeenCalledTimes(10);
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("annotation pagination cap (1000 annotations) reached"),
    );
    errSpy.mockRestore();
  });

  it("returns no annotations when the node is not a CheckRun", async () => {
    mockGraphql.mockResolvedValue({
      data: {
        node: {
          __typename: "StatusContext",
        },
      },
    });

    await expect(fetchCheckRunAnnotations("SC_123")).resolves.toEqual([]);
  });
});
