import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiResourceUsage } from "../types.mts";
import { evaluateWorktreeGraphqlQuotaWarning } from "./graphql-quota-warnings.mts";

vi.mock("../util/worktree.mts", () => ({ getWorktreeKey: async () => "fixture-worktree" }));

const bands = [
  { remainingPercent: 30, pollIntervalMinutes: 2 },
  { remainingPercent: 20, pollIntervalMinutes: 5 },
  { remainingPercent: 10, pollIntervalMinutes: 10 },
];
const repoKey = { owner: "acme", repo: "widgets" };
let stateDir = "";

function core(remaining: number, resetAt = 1_700_000_000): ApiResourceUsage {
  return {
    resource: "core",
    requestCount: 1,
    limit: 5000,
    used: 5000 - remaining,
    remaining,
    resetAt,
  };
}

beforeEach(async () => {
  stateDir = await mkdtemp(join(tmpdir(), "pr-shepherd-rest-quota-"));
  process.env["PR_SHEPHERD_STATE_DIR"] = stateDir;
});

afterEach(async () => {
  delete process.env["PR_SHEPHERD_STATE_DIR"];
  await rm(stateDir, { recursive: true, force: true });
});

describe("REST core quota warnings", () => {
  it("warns once per window when a band is crossed and stays quiet below it", async () => {
    await expect(
      evaluateWorktreeGraphqlQuotaWarning(repoKey, bands, core(4000), true, 1_699_999_000),
    ).resolves.toBeUndefined();

    const first = await evaluateWorktreeGraphqlQuotaWarning(
      repoKey,
      bands,
      core(1400),
      true,
      1_699_999_000,
    );
    const repeat = await evaluateWorktreeGraphqlQuotaWarning(
      repoKey,
      bands,
      core(1300),
      true,
      1_699_999_000,
    );

    expect(first).toMatchObject({ resource: "core", thresholdPercent: 30, remaining: 1400 });
    expect(repeat).toBeUndefined();
  });

  it("re-arms after the rate-limit window rolls over", async () => {
    await evaluateWorktreeGraphqlQuotaWarning(repoKey, bands, core(1400), true, 1_699_999_000);
    const next = await evaluateWorktreeGraphqlQuotaWarning(
      repoKey,
      bands,
      core(1400, 1_700_003_600),
      true,
      1_700_000_001,
    );
    expect(next).toMatchObject({ resource: "core", thresholdPercent: 30, resetAt: 1_700_003_600 });
  });
});
