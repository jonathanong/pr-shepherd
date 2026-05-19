import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

const { mockExecFile } = vi.hoisted(() => ({ mockExecFile: vi.fn() }));

vi.mock("node:child_process", () => ({
  execFile: (
    cmd: string,
    args: string[],
    optsOrCb:
      | Record<string, unknown>
      | ((err: Error | null, result: { stdout: string; stderr: string }) => void),
    maybeCb?: (err: Error | null, result: { stdout: string; stderr: string }) => void,
  ) => {
    const cb = typeof optsOrCb === "function" ? optsOrCb : maybeCb!;
    mockExecFile(cmd, args)
      .then((result: { stdout: string; stderr: string }) => cb(null, result))
      .catch((err: Error) => cb(err, { stdout: "", stderr: "" }));
  },
}));

import { getWorktreeRoot, getWorktreeKey } from "./worktree.mts";

beforeEach(() => {
  mockExecFile.mockReset();
});

describe("getWorktreeRoot", () => {
  it("returns trimmed stdout from git rev-parse --show-toplevel", async () => {
    mockExecFile.mockResolvedValue({ stdout: "/path/to/my-repo\n", stderr: "" });
    expect(await getWorktreeRoot()).toBe("/path/to/my-repo");
  });

  it("throws when not in a git repo", async () => {
    mockExecFile.mockRejectedValue(new Error("not a git repo"));
    await expect(getWorktreeRoot()).rejects.toThrow("not a git repo");
  });
});

describe("getWorktreeKey", () => {
  it("returns <basename>-<sha8> for a safe basename", async () => {
    mockExecFile.mockResolvedValue({ stdout: "/path/to/my-repo\n", stderr: "" });
    const sha8 = createHash("sha256").update("/path/to/my-repo").digest("hex").slice(0, 8);
    expect(await getWorktreeKey()).toBe(`my-repo-${sha8}`);
  });

  it("falls back to sha8-only for unsafe basenames (contains spaces)", async () => {
    mockExecFile.mockResolvedValue({ stdout: "/path/to/my repo\n", stderr: "" });
    const sha8 = createHash("sha256").update("/path/to/my repo").digest("hex").slice(0, 8);
    expect(await getWorktreeKey()).toBe(sha8);
  });

  it("produces the same key for the same path on repeated calls", async () => {
    mockExecFile.mockResolvedValue({ stdout: "/path/to/my-repo\n", stderr: "" });
    const key1 = await getWorktreeKey();
    const key2 = await getWorktreeKey();
    expect(key1).toBe(key2);
  });
});
