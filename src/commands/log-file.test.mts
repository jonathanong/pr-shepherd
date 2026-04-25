import { describe, it, expect, vi } from "vitest";

const { mockExecFile } = vi.hoisted(() => ({ mockExecFile: vi.fn() }));
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

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

import { runLogFile } from "./log-file.mts";

function gitRemote(url: string) {
  mockExecFile.mockImplementation((cmd: string, args: string[]) => {
    if (cmd === "git" && args[0] === "remote")
      return Promise.resolve({ stdout: `${url}\n`, stderr: "" });
    if (cmd === "git" && args[0] === "rev-parse")
      return Promise.resolve({ stdout: "/fake/worktree\n", stderr: "" });
    return Promise.reject(new Error(`unexpected: ${cmd} ${args.join(" ")}`));
  });
}

describe("runLogFile", () => {
  it("returns an object with a path property", async () => {
    gitRemote("https://github.com/acme/widgets.git");
    const result = await runLogFile();
    expect(result).toHaveProperty("path");
    expect(typeof result.path).toBe("string");
  });

  it("path contains the owner-repo segment", async () => {
    gitRemote("https://github.com/acme/widgets.git");
    const result = await runLogFile();
    expect(result.path).toContain("acme-widgets");
  });

  it("path contains the worktrees directory", async () => {
    gitRemote("https://github.com/acme/widgets.git");
    const result = await runLogFile();
    expect(result.path).toContain("worktrees");
  });

  it("path ends with .md", async () => {
    gitRemote("https://github.com/acme/widgets.git");
    const result = await runLogFile();
    expect(result.path).toMatch(/\.md$/);
  });

  it("throws when not in a git repo", async () => {
    mockExecFile.mockRejectedValue(new Error("not a git repo"));
    await expect(runLogFile()).rejects.toThrow();
  });
});
