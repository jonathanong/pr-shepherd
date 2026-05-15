// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";

const { mockStat, mockReaddir, mockRealpath } = vi.hoisted(() => ({
  mockStat: vi.fn(),
  mockReaddir: vi.fn(),
  mockRealpath: vi.fn(),
}));

const { mockRm } = vi.hoisted(() => ({ mockRm: vi.fn() }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    realpath: mockRealpath,
    stat: mockStat,
    readdir: mockReaddir,
    rm: mockRm,
  };
});

vi.mock("../github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "acme", name: "widgets" }),
  getCurrentBranch: vi.fn().mockResolvedValue("feature/test"),
  getCurrentPrNumber: vi.fn().mockResolvedValue(42),
  getPrNumberForBranch: vi.fn().mockResolvedValue(42),
}));

import { runClean } from "./clean.mts";

const BASE = join(tmpdir(), "clean-fs-mock-test");

beforeEach(() => {
  process.env["PR_SHEPHERD_STATE_DIR"] = BASE;
  mockRealpath.mockImplementation((p: string) => Promise.resolve(p));
  mockStat.mockResolvedValue({});
  mockReaddir.mockResolvedValue([]);
  mockRm.mockResolvedValue(undefined);
});

afterEach(() => {
  delete process.env["PR_SHEPHERD_STATE_DIR"];
});

describe("clean — readdir fallback", () => {
  it("uses target path as single deleted entry when readdir throws", async () => {
    mockReaddir.mockRejectedValue(new Error("EACCES: permission denied"));
    const result = await runClean({ variant: "all", dryRun: true });
    expect(result.ok).toBe(true);
    expect(result.deleted).toHaveLength(1);
    expect(result.deleted[0]).toBe(result.target);
  });
});

describe("clean — stat non-ENOENT error", () => {
  it("returns ok=false when stat throws a non-ENOENT error", async () => {
    const err = Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
    mockStat.mockRejectedValue(err);
    const result = await runClean({ variant: "all" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Failed to stat target/);
  });
});

describe("clean — rm failure", () => {
  it("returns ok=false when rm throws", async () => {
    mockRm.mockRejectedValue(new Error("EACCES: permission denied"));
    const result = await runClean({ variant: "all" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Failed to remove target/);
  });
});
