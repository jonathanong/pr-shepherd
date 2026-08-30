import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphqlApiUsage } from "../types.mts";
import { evaluateWorktreeGraphqlQuotaWarning } from "./graphql-quota-warnings.mts";

const testState = vi.hoisted(() => ({ base: "", failWorktree: false }));

vi.mock("./base.mts", () => ({ resolveStateBase: () => testState.base }));
vi.mock("../util/worktree.mts", () => ({
  getWorktreeKey: async () => {
    if (testState.failWorktree) throw new Error("not a worktree");
    return "fallback-test-worktree";
  },
}));

const bands = [{ remainingPercent: 30, pollIntervalMinutes: 2 }];
const repoKey = { owner: "fallback-owner", repo: "fallback-repo" };

function statePath(): string {
  return join(
    testState.base,
    "fallback-owner-fallback-repo",
    "worktrees",
    "fallback-test-worktree-graphql-quota-warnings.json",
  );
}

function sample(remaining = 1400): GraphqlApiUsage {
  return {
    resource: "graphql",
    requestCount: 1,
    limit: 5000,
    used: 5000 - remaining,
    remaining,
    resetAt: 1_700_000_000,
    measuredQueryCost: 1,
    unmeasuredRequestCount: 0,
    nodeCount: 1,
  };
}

beforeEach(async () => {
  testState.base = await mkdtemp(join(tmpdir(), "pr-shepherd-quota-fallback-"));
  testState.failWorktree = false;
});

afterEach(async () => {
  await rm(testState.base, { recursive: true, force: true });
});

describe("quota warning fallback branches", () => {
  it("evaluates without persistence when no worktree is available", async () => {
    testState.failWorktree = true;

    await expect(
      evaluateWorktreeGraphqlQuotaWarning(repoKey, bands, sample(), false),
    ).resolves.toMatchObject({ thresholdPercent: 30 });
  });

  it("releases the serialized queue after an evaluation rejects", async () => {
    const invalid = {
      ...sample(),
      get remaining(): number {
        throw new Error("sample failed");
      },
    } as GraphqlApiUsage;

    await expect(
      evaluateWorktreeGraphqlQuotaWarning(repoKey, bands, invalid, true),
    ).rejects.toThrow("sample failed");
    await expect(
      evaluateWorktreeGraphqlQuotaWarning(repoKey, bands, sample(), true),
    ).resolves.toMatchObject({ thresholdPercent: 30 });
  });

  it("suppresses a warning already claimed by another process", async () => {
    const claimsDir = `${statePath()}.claims`;
    await mkdir(claimsDir, { recursive: true });
    await writeFile(join(claimsDir, "1700000000-5000-30.json"), "{}", "utf8");

    await expect(
      evaluateWorktreeGraphqlQuotaWarning(repoKey, bands, sample(), true),
    ).resolves.toBeUndefined();
    await expect(readFile(statePath(), "utf8")).resolves.toContain('"warnedThresholds":[30]');
  });
});
