import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";

vi.mock("./client.mts", () => ({ graphql: vi.fn() }));

import { graphql } from "./client.mts";
import { fetchCheckRunAnnotations } from "./check-annotations.mts";

const mockGraphql = vi.mocked(graphql);
const stateKey = { owner: "owner", repo: "repo", pr: 3 };
let testStateDir: string;

beforeEach(() => {
  vi.clearAllMocks();
  testStateDir = `${process.env["TMPDIR"] ?? "/tmp"}/shepherd-annotations-cache-test-${randomBytes(4).toString("hex")}`;
  process.env["PR_SHEPHERD_STATE_DIR"] = testStateDir;
});

afterEach(async () => {
  delete process.env["PR_SHEPHERD_STATE_DIR"];
  await rm(testStateDir, { recursive: true, force: true });
});

function mockPage(nodes: unknown[]): void {
  mockGraphql.mockResolvedValueOnce({
    data: {
      node: {
        __typename: "CheckRun",
        annotations: { pageInfo: { hasNextPage: false, endCursor: null }, nodes },
      },
    },
  });
}

const rawAnnotation = {
  fullDatabaseId: "1",
  path: "src/a.mts",
  annotationLevel: "WARNING",
  title: "t",
  message: "m",
  rawDetails: null,
  blobUrl: null,
  location: null,
};

describe("fetchCheckRunAnnotations — cross-tick cache", () => {
  it("skips the GraphQL query on the second tick once cached", async () => {
    mockPage([rawAnnotation]);
    const first = await fetchCheckRunAnnotations("CR_1", { stateKey, headSha: "sha1" });
    expect(first).toHaveLength(1);
    expect(mockGraphql).toHaveBeenCalledTimes(1);

    const second = await fetchCheckRunAnnotations("CR_1", { stateKey, headSha: "sha1" });
    expect(second).toEqual(first);
    expect(mockGraphql).toHaveBeenCalledTimes(1);
  });

  it("re-fetches for a different check-run id (a re-run mints a new node id)", async () => {
    mockPage([rawAnnotation]);
    await fetchCheckRunAnnotations("CR_1", { stateKey, headSha: "sha1" });

    mockPage([{ ...rawAnnotation, fullDatabaseId: "2" }]);
    const result = await fetchCheckRunAnnotations("CR_2", { stateKey, headSha: "sha2" });
    expect(result[0]?.id).toBe("check_annotation_2");
    expect(mockGraphql).toHaveBeenCalledTimes(2);
  });

  it("does not cache when cacheOpts is omitted", async () => {
    mockPage([rawAnnotation]);
    await fetchCheckRunAnnotations("CR_1");
    mockPage([rawAnnotation]);
    await fetchCheckRunAnnotations("CR_1");
    expect(mockGraphql).toHaveBeenCalledTimes(2);
  });
});
