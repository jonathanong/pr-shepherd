import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { rm, readFile } from "node:fs/promises";
import { join } from "node:path";

// Mock getWorktreeKey so tests don't need a git repo.
vi.mock("../util/worktree.mts", () => ({
  getWorktreeKey: vi.fn().mockResolvedValue("test-worktree-abc12345"),
}));

let testStateDir: string;

beforeEach(() => {
  testStateDir = `${process.env["TMPDIR"] ?? "/tmp"}/shepherd-log-test-${randomBytes(4).toString("hex")}`;
  process.env["PR_SHEPHERD_STATE_DIR"] = testStateDir;
  delete process.env["PR_SHEPHERD_LOG_DISABLED"];
  delete process.env["CI"];
});

afterEach(async () => {
  delete process.env["PR_SHEPHERD_STATE_DIR"];
  await rm(testStateDir, { recursive: true, force: true });
});

async function freshModule() {
  vi.resetModules();
  const mod = await import("./log-file.mts");
  return mod;
}

describe("initLog + appendEntry", () => {
  it("creates the log file and appends content", async () => {
    const { initLog, appendEntry } = await freshModule();
    const path = await initLog({ owner: "acme", repo: "widgets" });
    expect(path).not.toBeNull();
    appendEntry("## Session\nhello\n");
    const content = await readFile(path!, "utf8");
    expect(content).toContain("## Session\nhello\n");
  });

  it("appends (does not truncate) on second call", async () => {
    const { initLog, appendEntry } = await freshModule();
    const path = await initLog({ owner: "acme", repo: "widgets" });
    appendEntry("first\n");
    appendEntry("second\n");
    const content = await readFile(path!, "utf8");
    expect(content).toContain("first\n");
    expect(content).toContain("second\n");
  });

  it("is a no-op when PR_SHEPHERD_LOG_DISABLED=1", async () => {
    process.env["PR_SHEPHERD_LOG_DISABLED"] = "1";
    const { initLog, appendEntry } = await freshModule();
    const path = await initLog({ owner: "acme", repo: "widgets" });
    expect(path).toBeNull();
    appendEntry("should not be written");
    // File should not exist
    try {
      await readFile(
        join(testStateDir, "acme-widgets", "worktrees", "test-worktree-abc12345.md"),
        "utf8",
      );
      expect.fail("file should not exist");
    } catch (e: unknown) {
      expect((e as NodeJS.ErrnoException).code).toBe("ENOENT");
    }
  });

  it("is a no-op when CI=true", async () => {
    process.env["CI"] = "true";
    const { initLog, appendEntry } = await freshModule();
    const path = await initLog({ owner: "acme", repo: "widgets" });
    expect(path).toBeNull();
    appendEntry("should not be written");
  });

  it("swallows write errors and disables further writes", async () => {
    const { initLog, appendEntry } = await freshModule();
    await initLog({ owner: "acme", repo: "widgets" });
    // Make it fail by removing the directory after init
    await rm(testStateDir, { recursive: true, force: true });
    // Should not throw
    expect(() => appendEntry("after removal\n")).not.toThrow();
    // Subsequent appends are no-ops (disabled flag is set)
    expect(() => appendEntry("another append\n")).not.toThrow();
  });
});

describe("resolveLogPath", () => {
  it("returns the expected path structure", async () => {
    const { resolveLogPath } = await freshModule();
    const path = await resolveLogPath({ owner: "acme", repo: "widgets" });
    expect(path).toContain("acme-widgets");
    expect(path).toContain("worktrees");
    expect(path).toContain("test-worktree-abc12345.md");
  });

  it("throws for invalid owner/repo segments", async () => {
    const { resolveLogPath } = await freshModule();
    await expect(resolveLogPath({ owner: "acme/evil", repo: "widgets" })).rejects.toThrow();
  });
});

describe("getLogFilePath", () => {
  it("throws for invalid owner segment", async () => {
    const { getLogFilePath } = await freshModule();
    expect(() => getLogFilePath({ owner: "bad/owner", repo: "widgets" })).toThrow(
      /Invalid repo key segments/,
    );
  });

  it("uses 'unknown' worktree key before initLog is called", async () => {
    const { getLogFilePath } = await freshModule();
    const path = getLogFilePath({ owner: "acme", repo: "widgets" });
    expect(path).toContain("unknown.md");
  });
});

describe("initLog validation", () => {
  it("returns null for invalid owner segment without throwing", async () => {
    const { initLog } = await freshModule();
    const path = await initLog({ owner: "bad/owner", repo: "widgets" });
    expect(path).toBeNull();
  });
});

describe("initLog error handling", () => {
  it("disables log when getWorktreeKey throws", async () => {
    vi.resetModules();
    const { getWorktreeKey } = await import("../util/worktree.mts");
    vi.mocked(getWorktreeKey).mockRejectedValueOnce(new Error("not a git repo"));
    const { initLog, appendEntry } = await import("./log-file.mts");
    const path = await initLog({ owner: "acme", repo: "widgets" });
    expect(path).toBeNull();
    expect(() => appendEntry("test")).not.toThrow();
  });
});

describe("_resetLogState", () => {
  it("resets entry counter and clears log path", async () => {
    const { initLog, nextEntry, _resetLogState } = await freshModule();
    await initLog({ owner: "acme", repo: "widgets" });
    nextEntry();
    nextEntry(); // counter = 2
    _resetLogState();
    expect(nextEntry()).toBe(1); // reset to 0, incremented to 1
  });
});
