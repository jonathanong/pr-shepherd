// @ts-nocheck
import { describe, it, expect, vi } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock fs/promises so that stat succeeds (target "exists") but readdir fails.
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    stat: vi.fn().mockResolvedValue({}),
    readdir: vi.fn().mockRejectedValue(new Error("EACCES: permission denied")),
  };
});

vi.mock("../github/client.mts", () => ({
  getRepoInfo: vi.fn().mockResolvedValue({ owner: "acme", name: "widgets" }),
  getCurrentBranch: vi.fn().mockResolvedValue("feature/test"),
  getCurrentPrNumber: vi.fn().mockResolvedValue(42),
  getPrNumberForBranch: vi.fn().mockResolvedValue(42),
}));

import { runClean } from "./clean.mts";

describe("clean — readdir fallback", () => {
  it("uses target path as single deleted entry when readdir throws", async () => {
    process.env["PR_SHEPHERD_STATE_DIR"] = join(tmpdir(), "readdir-fallback-test");
    const result = await runClean({ variant: "all", dryRun: true });
    delete process.env["PR_SHEPHERD_STATE_DIR"];
    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.deleted).toHaveLength(1);
    expect(result.deleted[0]).toBe(result.target);
  });
});
