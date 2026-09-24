import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";

const { mockExecFileSync } = vi.hoisted(() => ({ mockExecFileSync: vi.fn() }));
vi.mock("node:child_process", () => ({ execFileSync: mockExecFileSync }));

const savedPlatform = process.platform;
const savedStateDir = process.env["PR_SHEPHERD_STATE_DIR"];

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
}

// The per-user temp dir is read once per process, so each test loads a fresh module.
async function loadResolveStateBase() {
  vi.resetModules();
  return (await import("./base.mts")).resolveStateBase;
}

beforeEach(() => {
  mockExecFileSync.mockReset();
  delete process.env["PR_SHEPHERD_STATE_DIR"];
});

afterEach(() => {
  setPlatform(savedPlatform);
  if (savedStateDir === undefined) delete process.env["PR_SHEPHERD_STATE_DIR"];
  else process.env["PR_SHEPHERD_STATE_DIR"] = savedStateDir;
});

describe("resolveStateBase — default location", () => {
  it("uses macOS's per-user temp dir instead of TMPDIR, reading it once", async () => {
    setPlatform("darwin");
    mockExecFileSync.mockReturnValue("/var/folders/ab/user-temp/T/\n");
    const resolveStateBase = await loadResolveStateBase();

    expect(resolveStateBase()).toBe(join("/var/folders/ab/user-temp/T/", "pr-shepherd-state"));
    expect(resolveStateBase()).toBe(join("/var/folders/ab/user-temp/T/", "pr-shepherd-state"));
    expect(mockExecFileSync).toHaveBeenCalledTimes(1);
    expect(mockExecFileSync).toHaveBeenCalledWith(
      "/usr/bin/getconf",
      ["DARWIN_USER_TEMP_DIR"],
      expect.objectContaining({ encoding: "utf8" }),
    );
  });

  it.each([
    [
      "getconf fails",
      () =>
        mockExecFileSync.mockImplementation(() => {
          throw new Error("ENOENT");
        }),
    ],
    ["getconf prints a relative path", () => mockExecFileSync.mockReturnValue("T\n")],
  ])("falls back to os.tmpdir() on macOS when %s, without retrying", async (_label, arrange) => {
    setPlatform("darwin");
    arrange();
    const resolveStateBase = await loadResolveStateBase();

    expect(resolveStateBase()).toBe(join(tmpdir(), "pr-shepherd-state"));
    expect(resolveStateBase()).toBe(join(tmpdir(), "pr-shepherd-state"));
    expect(mockExecFileSync).toHaveBeenCalledTimes(1);
  });

  it("uses os.tmpdir() on other platforms without spawning getconf", async () => {
    setPlatform("linux");
    const resolveStateBase = await loadResolveStateBase();

    expect(resolveStateBase()).toBe(join(tmpdir(), "pr-shepherd-state"));
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it.each([
    ["set", "/custom/state", "/custom/state"],
    ["empty", "", join("/var/folders/ab/user-temp/T/", "pr-shepherd-state")],
  ])("honors PR_SHEPHERD_STATE_DIR only when %s", async (_label, value, expected) => {
    setPlatform("darwin");
    mockExecFileSync.mockReturnValue("/var/folders/ab/user-temp/T/\n");
    process.env["PR_SHEPHERD_STATE_DIR"] = value;
    const resolveStateBase = await loadResolveStateBase();

    expect(resolveStateBase()).toBe(expected);
  });
});
