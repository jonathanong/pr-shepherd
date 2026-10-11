import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";

const fsMock = vi.hoisted(() => ({
  mkdirSync: vi.fn(),
  lstatSync: vi.fn(),
  accessSync: vi.fn(),
}));
vi.mock("node:fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs")>()),
  ...fsMock,
}));
const { mockExecFileSync } = vi.hoisted(() => ({ mockExecFileSync: vi.fn() }));
vi.mock("node:child_process", () => ({ execFileSync: mockExecFileSync }));

const savedPlatform = process.platform;
const savedGetuid = process.getuid;
const savedStateDir = process.env["PR_SHEPHERD_STATE_DIR"];
const UID = 4242;
const SHARED = join("/tmp", `pr-shepherd-state-${UID}`);
const FALLBACK = join(tmpdir(), "pr-shepherd-state");

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
}

function ownedDir(overrides: { uid?: number; mode?: number; isDirectory?: boolean } = {}) {
  return {
    isDirectory: () => overrides.isDirectory ?? true,
    uid: overrides.uid ?? UID,
    mode: overrides.mode ?? 0o40700,
  };
}

function errno(code: string): Error {
  return Object.assign(new Error(code), { code });
}

function mkdirThrows(code: string): void {
  fsMock.mkdirSync.mockImplementation(() => {
    throw errno(code);
  });
}

// The shared base is resolved once per process, so each test loads a fresh module.
async function loadResolveStateBase() {
  vi.resetModules();
  return (await import("./base.mts")).resolveStateBase;
}

beforeEach(() => {
  for (const fn of Object.values(fsMock)) fn.mockReset();
  mockExecFileSync.mockReset();
  fsMock.lstatSync.mockReturnValue(ownedDir());
  delete process.env["PR_SHEPHERD_STATE_DIR"];
  setPlatform("linux");
  process.getuid = () => UID;
});

afterEach(() => {
  setPlatform(savedPlatform);
  process.getuid = savedGetuid;
  if (savedStateDir === undefined) delete process.env["PR_SHEPHERD_STATE_DIR"];
  else process.env["PR_SHEPHERD_STATE_DIR"] = savedStateDir;
});

describe("resolveStateBase — Linux shared per-user directory", () => {
  it("uses /tmp/pr-shepherd-state-<uid> instead of TMPDIR, resolving it once", async () => {
    const resolveStateBase = await loadResolveStateBase();

    expect(resolveStateBase()).toBe(SHARED);
    expect(resolveStateBase()).toBe(SHARED);
    expect(fsMock.mkdirSync).toHaveBeenCalledTimes(1);
    expect(fsMock.mkdirSync).toHaveBeenCalledWith(SHARED, { mode: 0o700 });
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it("reuses a directory an earlier sandboxed or unsandboxed run created", async () => {
    mkdirThrows("EEXIST");
    const resolveStateBase = await loadResolveStateBase();

    expect(resolveStateBase()).toBe(SHARED);
  });

  it.each([
    ["another user owns it", ownedDir({ uid: UID + 1 })],
    ["it is group-writable", ownedDir({ mode: 0o40770 })],
    ["it is world-writable", ownedDir({ mode: 0o40777 })],
    ["it is a symlink or file", ownedDir({ isDirectory: false })],
  ])("falls back to os.tmpdir() when %s", async (_label, stat) => {
    mkdirThrows("EEXIST");
    fsMock.lstatSync.mockReturnValue(stat);
    const resolveStateBase = await loadResolveStateBase();

    expect(resolveStateBase()).toBe(FALLBACK);
    expect(resolveStateBase()).toBe(FALLBACK);
    expect(fsMock.mkdirSync).toHaveBeenCalledTimes(1);
  });

  it("falls back to os.tmpdir() when the sandbox cannot create the directory", async () => {
    mkdirThrows("EACCES");
    const resolveStateBase = await loadResolveStateBase();

    expect(resolveStateBase()).toBe(FALLBACK);
    expect(fsMock.lstatSync).not.toHaveBeenCalled();
  });

  it("falls back to os.tmpdir() when the existing directory is not writable here", async () => {
    mkdirThrows("EEXIST");
    fsMock.accessSync.mockImplementation(() => {
      throw errno("EROFS");
    });
    const resolveStateBase = await loadResolveStateBase();

    expect(resolveStateBase()).toBe(FALLBACK);
  });

  it("falls back to os.tmpdir() when lstat fails", async () => {
    fsMock.lstatSync.mockImplementation(() => {
      throw errno("ENOENT");
    });
    const resolveStateBase = await loadResolveStateBase();

    expect(resolveStateBase()).toBe(FALLBACK);
  });

  it("falls back to os.tmpdir() when the process has no uid", async () => {
    process.getuid = undefined;
    const resolveStateBase = await loadResolveStateBase();

    expect(resolveStateBase()).toBe(FALLBACK);
    expect(fsMock.mkdirSync).not.toHaveBeenCalled();
  });

  it("prefers PR_SHEPHERD_STATE_DIR without touching /tmp", async () => {
    process.env["PR_SHEPHERD_STATE_DIR"] = "/custom/state";
    const resolveStateBase = await loadResolveStateBase();

    expect(resolveStateBase()).toBe("/custom/state");
    expect(fsMock.mkdirSync).not.toHaveBeenCalled();
  });
});
