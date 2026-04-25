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
