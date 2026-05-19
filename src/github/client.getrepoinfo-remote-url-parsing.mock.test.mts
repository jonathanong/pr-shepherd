import { describe, it, expect } from "vitest";
import { mockExecFile, registerClientHooks } from "./client.test-support.mts";
import { getRepoInfo } from "./client.mts";

registerClientHooks();

describe("getRepoInfo — remote URL parsing", () => {
  it("parses git@github.com:owner/repo.git", async () => {
    mockExecFile.mockResolvedValue({ stdout: "git@github.com:owner/repo.git\n", stderr: "" });
    expect(await getRepoInfo()).toEqual({ owner: "owner", name: "repo" });
  });

  it("parses https://github.com/owner/repo.git", async () => {
    mockExecFile.mockResolvedValue({ stdout: "https://github.com/owner/repo.git\n", stderr: "" });
    expect(await getRepoInfo()).toEqual({ owner: "owner", name: "repo" });
  });

  it("parses https://github.com/owner/repo (no .git)", async () => {
    mockExecFile.mockResolvedValue({ stdout: "https://github.com/owner/repo\n", stderr: "" });
    expect(await getRepoInfo()).toEqual({ owner: "owner", name: "repo" });
  });

  it("parses ssh://git@github.com/owner/repo.git", async () => {
    mockExecFile.mockResolvedValue({
      stdout: "ssh://git@github.com/owner/repo.git\n",
      stderr: "",
    });
    expect(await getRepoInfo()).toEqual({ owner: "owner", name: "repo" });
  });

  it("throws for unsupported remote URL shapes", async () => {
    mockExecFile.mockResolvedValue({
      stdout: "https://github.com/owner/repo/extra.git\n",
      stderr: "",
    });
    await expect(getRepoInfo()).rejects.toThrow("Cannot parse GitHub remote URL");
  });
});
