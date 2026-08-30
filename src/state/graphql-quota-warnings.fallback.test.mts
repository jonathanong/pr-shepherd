import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
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

  it("suppresses a warning already claimed by another process for the same epoch", async () => {
    const claimsDir = `${statePath()}.claims`;
    await mkdir(claimsDir, { recursive: true });
    // This is the first-ever evaluation for this key (no persisted state),
    // so it computes re-arm epoch 1; simulate another process already
    // having won that exact epoch's claim.
    await writeFile(join(claimsDir, "1700000000-5000-30-1.json"), "{}", "utf8");

    // Evaluate before sample()'s resetAt (1_700_000_000) so the sweep does
    // not treat the fixture claim as belonging to an already-reset window.
    await expect(
      evaluateWorktreeGraphqlQuotaWarning(repoKey, bands, sample(), true, 1_699_999_999),
    ).resolves.toBeUndefined();
    await expect(readFile(statePath(), "utf8")).resolves.toContain('"warnedThresholds":[30]');
  });

  it("re-fires on a credential-switch re-arm despite a lingering claim from the prior epoch", async () => {
    const claimsDir = `${statePath()}.claims`;
    await mkdir(claimsDir, { recursive: true });
    // A prior process already warned in epoch 1 for this resetAt, and its
    // claim file is still on disk (resetAt hasn't passed, so nothing swept
    // it).
    await writeFile(join(claimsDir, "1700000000-5000-30-1.json"), "{}", "utf8");
    await mkdir(join(testState.base, "fallback-owner-fallback-repo", "worktrees"), {
      recursive: true,
    });
    await writeFile(
      statePath(),
      JSON.stringify({
        resource: "graphql",
        limit: 5000,
        lastUsed: 4500,
        lastRemaining: 500,
        resetAt: 1_700_000_000,
        warnedThresholds: [30],
        rearmEpoch: 1,
      }),
      "utf8",
    );

    // Same resetAt, but usage dropped (e.g. a switch to another credential
    // sharing the same hourly window) — the policy re-arms into epoch 2,
    // which claims a distinct filename and must still surface the warning.
    // Evaluate before resetAt so the sweep leaves the epoch-1 fixture alone.
    await expect(
      evaluateWorktreeGraphqlQuotaWarning(repoKey, bands, sample(1400), true, 1_699_999_999),
    ).resolves.toMatchObject({ thresholdPercent: 30 });

    const claims = await readdir(claimsDir);
    expect(claims).toContain("1700000000-5000-30-1.json");
    expect(claims).toContain("1700000000-5000-30-2.json");
  });

  it("sweeps claim files whose window has already reset", async () => {
    const claimsDir = `${statePath()}.claims`;
    await mkdir(claimsDir, { recursive: true });
    await writeFile(join(claimsDir, "999-5000-20-1.json"), "{}", "utf8");

    await expect(
      evaluateWorktreeGraphqlQuotaWarning(repoKey, bands, sample(), true, 1_699_000_000),
    ).resolves.toMatchObject({ thresholdPercent: 30 });

    const remaining = await readdir(claimsDir);
    expect(remaining).not.toContain("999-5000-20-1.json");
    expect(remaining).toContain("1700000000-5000-30-1.json");
  });
});
