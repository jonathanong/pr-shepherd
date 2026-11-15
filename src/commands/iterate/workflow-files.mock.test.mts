import { beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubRequestError } from "../../github/errors.mts";

const { mockGraphql, mockReadRest } = vi.hoisted(() => ({
  mockGraphql: vi.fn(),
  mockReadRest: vi.fn(),
}));
vi.mock("../../github/client.mts", () => ({ graphql: mockGraphql }));
vi.mock("../../github/rest-reader-core.mts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../github/rest-reader-core.mts")>()),
  readRest: mockReadRest,
}));

import { runWithGithubTransport } from "../../github/transport.mts";
import { clearWorkflowFileMemo, readWorkflowFiles } from "./workflow-files.mts";

const repo = { owner: "owner", name: "repo" };
const sha = "a".repeat(40);
const ci = { ref: sha, path: ".github/workflows/ci.yml", pinned: true };
const lint = { ref: sha, path: ".github/workflows/lint.yml", pinned: true };
const blob = (text: string, isTruncated = false) => ({ text, isTruncated });

describe("readWorkflowFiles over GraphQL", () => {
  beforeEach(() => {
    mockGraphql.mockReset();
    clearWorkflowFileMemo();
  });

  it("reads every file in one aliased query and maps blob answers", async () => {
    mockGraphql.mockResolvedValue({
      data: { repository: { w0: blob("a: 1"), w1: blob("big", true) } },
    });
    const result = await readWorkflowFiles(repo, [ci, lint]);
    expect(mockGraphql).toHaveBeenCalledTimes(1);
    const [query, variables] = mockGraphql.mock.calls[0]!;
    expect(query).toContain("w0: object(expression: $e0)");
    expect(query).toContain("w1: object(expression: $e1)");
    expect(variables).toEqual({
      owner: "owner",
      name: "repo",
      e0: `${sha}:.github/workflows/ci.yml`,
      e1: `${sha}:.github/workflows/lint.yml`,
    });
    expect(result.get(`${sha}:.github/workflows/ci.yml`)).toEqual({ text: "a: 1" });
    expect(result.get(`${sha}:.github/workflows/lint.yml`)).toEqual({ unreadable: "truncated" });
  });

  it("treats a missing file, a tree, and a missing repository as 404", async () => {
    mockGraphql.mockResolvedValueOnce({ data: { repository: { w0: null, w1: {} } } });
    const result = await readWorkflowFiles(repo, [ci, lint]);
    expect([...result.values()]).toEqual([{ unreadable: "404" }, { unreadable: "404" }]);
    clearWorkflowFileMemo();
    mockGraphql.mockResolvedValueOnce({ data: { repository: null } });
    expect([...(await readWorkflowFiles(repo, [ci])).values()]).toEqual([{ unreadable: "404" }]);
  });

  it("remembers files read at a commit SHA and reads only what is missing", async () => {
    mockGraphql.mockResolvedValueOnce({ data: { repository: { w0: blob("a: 1") } } });
    await readWorkflowFiles(repo, [ci]);
    mockGraphql.mockResolvedValueOnce({ data: { repository: { w0: blob("b: 2") } } });
    const result = await readWorkflowFiles(repo, [ci, lint]);
    expect(mockGraphql).toHaveBeenCalledTimes(2);
    expect(mockGraphql.mock.calls[1]![1]).toMatchObject({
      e0: `${sha}:.github/workflows/lint.yml`,
    });
    expect(result.get(`${sha}:.github/workflows/ci.yml`)).toEqual({ text: "a: 1" });
    mockGraphql.mockClear();
    await readWorkflowFiles(repo, [ci, lint]);
    expect(mockGraphql).not.toHaveBeenCalled();
  });

  it("does not remember a branch read or a failed read", async () => {
    const base = { ref: "main", path: ".github/workflows/ci.yml", pinned: false };
    mockGraphql.mockResolvedValue({ data: { repository: { w0: blob("a: 1") } } });
    await readWorkflowFiles(repo, [base]);
    await readWorkflowFiles(repo, [base]);
    expect(mockGraphql).toHaveBeenCalledTimes(2);
    mockGraphql.mockReset();
    mockGraphql.mockResolvedValue({ data: { repository: { w0: blob("x", true) } } });
    await readWorkflowFiles(repo, [ci]);
    await readWorkflowFiles(repo, [ci]);
    expect(mockGraphql).toHaveBeenCalledTimes(2);
  });

  it("returns an empty map without a request when nothing is asked", async () => {
    expect((await readWorkflowFiles(repo, [])).size).toBe(0);
    expect(mockGraphql).not.toHaveBeenCalled();
  });

  it("marks every file unreadable on an ordinary failure and says so on stderr", async () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    mockGraphql.mockRejectedValueOnce(new Error("unavailable"));
    const result = await readWorkflowFiles(repo, [ci, lint]);
    expect([...result.values()]).toEqual([
      { unreadable: "request failed" },
      { unreadable: "request failed" },
    ]);
    expect(write).toHaveBeenCalledWith(expect.stringContaining("unavailable"));
    write.mockRestore();
  });

  it("rethrows a rate limit", async () => {
    mockGraphql.mockRejectedValueOnce(new GitHubRequestError("rate limit", { status: 429 }));
    await expect(readWorkflowFiles(repo, [ci])).rejects.toBeInstanceOf(GitHubRequestError);
  });

  it("stringifies a non-Error failure", async () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    mockGraphql.mockRejectedValueOnce("boom");
    await readWorkflowFiles(repo, [ci]);
    expect(write).toHaveBeenCalledWith(expect.stringContaining("boom"));
    write.mockRestore();
  });

  it("marks a file unreadable when a REST read fails without an HTTP status", async () => {
    mockReadRest.mockRejectedValueOnce(new TypeError("socket closed"));
    const result = await runWithGithubTransport("rest", () => readWorkflowFiles(repo, [ci]));
    expect([...result.values()]).toEqual([{ unreadable: "request failed" }]);
  });
});
