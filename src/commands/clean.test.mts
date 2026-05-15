// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm, mkdir, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";

vi.mock("../github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "acme", name: "widgets" }),
  getCurrentBranch: vi.fn().mockResolvedValue("feature/test"),
  getCurrentPrNumber: vi.fn().mockResolvedValue(42),
  getPrNumberForBranch: vi.fn().mockResolvedValue(42),
}));

import { runClean } from "./clean.mts";
import {
  getRepoInfo,
  getCurrentBranch,
  getCurrentPrNumber,
  getPrNumberForBranch,
} from "../github/client.mts";

const mockGetRepoInfo = vi.mocked(getRepoInfo);
const mockGetCurrentBranch = vi.mocked(getCurrentBranch);
const mockGetCurrentPrNumber = vi.mocked(getCurrentPrNumber);
const mockGetPrNumberForBranch = vi.mocked(getPrNumberForBranch);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function seedPrDir(stateDir: string, pr: number) {
  const prDir = join(stateDir, "acme-widgets", String(pr));
  await mkdir(join(prDir, "seen"), { recursive: true });
  await writeFile(join(prDir, "fix-attempts.json"), "{}", "utf8");
  return prDir;
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

let stateDir: string;

beforeEach(async () => {
  stateDir = await mkdtemp(join(tmpdir(), "shepherd-clean-test-"));
  process.env["PR_SHEPHERD_STATE_DIR"] = stateDir;
  vi.clearAllMocks();
  // Restore defaults after clearAllMocks.
  mockGetRepoInfo.mockResolvedValue({ owner: "acme", name: "widgets" });
  mockGetCurrentBranch.mockResolvedValue("feature/test");
  mockGetCurrentPrNumber.mockResolvedValue(42);
  mockGetPrNumberForBranch.mockResolvedValue(42);
});

afterEach(async () => {
  delete process.env["PR_SHEPHERD_STATE_DIR"];
  await rm(stateDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// clean all
// ---------------------------------------------------------------------------

describe("clean all", () => {
  it("deletes the entire state base", async () => {
    await mkdir(join(stateDir, "acme-widgets", "42"), { recursive: true });
    const result = await runClean({ variant: "all" });
    expect(result.ok).toBe(true);
    expect(result.deleted).toHaveLength(1);
    expect(await exists(stateDir)).toBe(false);
  });

  it("returns skipped when state base does not exist", async () => {
    await rm(stateDir, { recursive: true, force: true });
    const result = await runClean({ variant: "all" });
    expect(result.ok).toBe(true);
    expect(result.deleted).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
  });

  it("dry-run lists entries without deleting", async () => {
    await mkdir(join(stateDir, "acme-widgets", "42"), { recursive: true });
    const result = await runClean({ variant: "all", dryRun: true });
    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.deleted).toHaveLength(1);
    expect(await exists(stateDir)).toBe(true);
  });

  it("reports empty deleted list when target is empty", async () => {
    const result = await runClean({ variant: "all" });
    expect(result.ok).toBe(true);
    expect(result.deleted).toHaveLength(0);
  });

  it("json output contains expected fields", async () => {
    const result = await runClean({ variant: "all", dryRun: true });
    expect(result).toMatchObject({
      ok: true,
      variant: "all",
      dryRun: true,
      base: stateDir,
      target: stateDir,
    });
  });
});

// ---------------------------------------------------------------------------
// clean repo
// ---------------------------------------------------------------------------

describe("clean repo", () => {
  it("deletes the owner-repo directory", async () => {
    await seedPrDir(stateDir, 42);
    const result = await runClean({ variant: "repo" });
    expect(result.ok).toBe(true);
    expect(result.deleted.length).toBeGreaterThan(0);
    expect(await exists(join(stateDir, "acme-widgets"))).toBe(false);
  });

  it("returns skipped when repo dir does not exist", async () => {
    const result = await runClean({ variant: "repo" });
    expect(result.ok).toBe(true);
    expect(result.deleted).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
  });

  it("dry-run lists entries without deleting", async () => {
    await seedPrDir(stateDir, 42);
    const result = await runClean({ variant: "repo", dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.deleted.length).toBeGreaterThan(0);
    expect(await exists(join(stateDir, "acme-widgets"))).toBe(true);
  });

  it("target is set to base/owner-repo", async () => {
    const result = await runClean({ variant: "repo" });
    expect(result.target).toBe(join(stateDir, "acme-widgets"));
  });
});

// ---------------------------------------------------------------------------
// clean pr (explicit number)
// ---------------------------------------------------------------------------

describe("clean pr (explicit number)", () => {
  it("deletes the PR state directory", async () => {
    await seedPrDir(stateDir, 42);
    const result = await runClean({ variant: "pr", value: "42" });
    expect(result.ok).toBe(true);
    expect(result.deleted.length).toBeGreaterThan(0);
    expect(await exists(join(stateDir, "acme-widgets", "42"))).toBe(false);
  });

  it("leaves other PRs intact", async () => {
    await seedPrDir(stateDir, 42);
    await seedPrDir(stateDir, 99);
    await runClean({ variant: "pr", value: "42" });
    expect(await exists(join(stateDir, "acme-widgets", "99"))).toBe(true);
  });

  it("dry-run lists contents without deleting", async () => {
    await seedPrDir(stateDir, 42);
    const result = await runClean({ variant: "pr", value: "42", dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.deleted.length).toBeGreaterThan(0);
    expect(await exists(join(stateDir, "acme-widgets", "42"))).toBe(true);
  });

  it("returns skipped when PR dir does not exist", async () => {
    const result = await runClean({ variant: "pr", value: "9999" });
    expect(result.ok).toBe(true);
    expect(result.deleted).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
  });

  it("errors on non-numeric PR value", async () => {
    const result = await runClean({ variant: "pr", value: "abc" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Invalid PR number/);
  });

  it("errors on PR number 0", async () => {
    const result = await runClean({ variant: "pr", value: "0" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Invalid PR number/);
  });

  it("errors on negative PR number", async () => {
    const result = await runClean({ variant: "pr", value: "-1" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Invalid PR number/);
  });
});

// ---------------------------------------------------------------------------
// clean pr (inferred from current branch)
// ---------------------------------------------------------------------------

describe("clean pr (inferred)", () => {
  it("resolves current PR and deletes its state", async () => {
    await seedPrDir(stateDir, 42);
    const result = await runClean({ variant: "pr" });
    expect(result.ok).toBe(true);
    expect(await exists(join(stateDir, "acme-widgets", "42"))).toBe(false);
  });

  it("errors when no open PR found for current branch", async () => {
    mockGetCurrentPrNumber.mockResolvedValueOnce(null);
    const result = await runClean({ variant: "pr" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/No open PR/);
  });
});

// ---------------------------------------------------------------------------
// clean branch
// ---------------------------------------------------------------------------

describe("clean branch", () => {
  it("resolves branch to PR and deletes state", async () => {
    mockGetPrNumberForBranch.mockResolvedValueOnce(55);
    await seedPrDir(stateDir, 55);
    const result = await runClean({ variant: "branch", value: "feature/foo" });
    expect(result.ok).toBe(true);
    expect(await exists(join(stateDir, "acme-widgets", "55"))).toBe(false);
  });

  it("errors when no open PR found for the branch", async () => {
    mockGetPrNumberForBranch.mockResolvedValueOnce(null);
    const result = await runClean({ variant: "branch", value: "feature/no-pr" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/No open PR found for branch/);
  });

  it("uses current branch when no value provided", async () => {
    mockGetCurrentBranch.mockResolvedValueOnce("feature/current");
    mockGetPrNumberForBranch.mockResolvedValueOnce(77);
    await seedPrDir(stateDir, 77);
    const result = await runClean({ variant: "branch" });
    expect(result.ok).toBe(true);
    expect(await exists(join(stateDir, "acme-widgets", "77"))).toBe(false);
  });

  it("errors on detached HEAD when no value provided", async () => {
    mockGetCurrentBranch.mockResolvedValueOnce("HEAD");
    const result = await runClean({ variant: "branch" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/detached HEAD/);
  });
});

// ---------------------------------------------------------------------------
// clean current (alias for branch)
// ---------------------------------------------------------------------------

describe("clean current", () => {
  it("uses current branch to resolve PR and deletes state", async () => {
    mockGetCurrentBranch.mockResolvedValueOnce("my-branch");
    mockGetPrNumberForBranch.mockResolvedValueOnce(33);
    await seedPrDir(stateDir, 33);
    const result = await runClean({ variant: "current" });
    expect(result.ok).toBe(true);
    expect(await exists(join(stateDir, "acme-widgets", "33"))).toBe(false);
  });

  it("result variant is 'current'", async () => {
    mockGetPrNumberForBranch.mockResolvedValueOnce(33);
    await seedPrDir(stateDir, 33);
    const result = await runClean({ variant: "current" });
    expect(result.variant).toBe("current");
  });
});

// ---------------------------------------------------------------------------
// Path safety
// ---------------------------------------------------------------------------

describe("path safety", () => {
  it("errors when git repo owner contains invalid characters", async () => {
    mockGetRepoInfo.mockResolvedValueOnce({ owner: "../evil", name: "widgets" });
    const result = await runClean({ variant: "repo" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Invalid repository segment/);
  });

  it("errors when git repo name contains invalid characters", async () => {
    mockGetRepoInfo.mockResolvedValueOnce({ owner: "acme", name: "../../etc" });
    const result = await runClean({ variant: "repo" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Invalid repository segment/);
  });
});
