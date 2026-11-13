import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubRequestError } from "../../github/errors.mts";

const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("../../github/rest-conflict-files-read.mts", () => ({
  readRestFilesChangedOnBothSides: read,
}));

import { lookupConflictCandidateFiles } from "./conflict-candidate-files.mts";

const input = { owner: "owner", repo: "repo", baseRefName: "main", headRefOid: "abc" };

describe("lookupConflictCandidateFiles", () => {
  afterEach(() => read.mockReset());

  it("caps the list and keeps the full count", async () => {
    const files = Array.from({ length: 28 }, (_, i) => `f${i}.ts`);
    read.mockResolvedValue(files);
    await expect(lookupConflictCandidateFiles(input)).resolves.toEqual({
      files: files.slice(0, 25),
      total: files.length,
    });
    expect(read).toHaveBeenCalledWith({ owner: "owner", name: "repo" }, "main", "abc");
  });

  it("returns nothing when no file changed on both sides", async () => {
    read.mockResolvedValue([]);
    await expect(lookupConflictCandidateFiles(input)).resolves.toBeUndefined();
  });

  it("rethrows rate limits and ignores other failures", async () => {
    read.mockRejectedValueOnce(new GitHubRequestError("rate limit", { status: 429 }));
    await expect(lookupConflictCandidateFiles(input)).rejects.toBeInstanceOf(GitHubRequestError);
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    read.mockRejectedValueOnce(new Error("unavailable"));
    await expect(lookupConflictCandidateFiles(input)).resolves.toBeUndefined();
    read.mockRejectedValueOnce("plain");
    await expect(lookupConflictCandidateFiles(input)).resolves.toBeUndefined();
    expect(write).toHaveBeenCalledWith(expect.stringContaining("unavailable"));
    expect(write).toHaveBeenCalledWith(expect.stringContaining("plain"));
    write.mockRestore();
  });
});
