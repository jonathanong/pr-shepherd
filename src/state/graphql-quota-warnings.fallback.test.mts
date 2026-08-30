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

  it("suppresses a warning already claimed by another process within its window", async () => {
    const claimsDir = `${statePath()}.claims`;
    await mkdir(claimsDir, { recursive: true });
    await writeFile(join(claimsDir, "1700000000-5000-30.json"), "{}", "utf8");

    // sample()'s resetAt is 1_700_000_000; evaluate before that so the
    // pre-existing claim is still within its window and its own 1-hour
    // timer, and thus should still suppress the warning.
    await expect(
      evaluateWorktreeGraphqlQuotaWarning(repoKey, bands, sample(), true, 1_699_999_999),
    ).resolves.toBeUndefined();
    await expect(readFile(statePath(), "utf8")).resolves.toContain('"warnedThresholds":[30]');
  });

  it("re-claims and re-fires once the claimed window has reset", async () => {
    const claimsDir = `${statePath()}.claims`;
    await mkdir(claimsDir, { recursive: true });
    await writeFile(join(claimsDir, "1700000000-5000-30.json"), "{}", "utf8");

    // now has passed sample()'s resetAt (1_700_000_000), so the claim
    // belongs to a window that has already reset and must not suppress.
    await expect(
      evaluateWorktreeGraphqlQuotaWarning(repoKey, bands, sample(), true, 1_700_000_500),
    ).resolves.toMatchObject({ thresholdPercent: 30 });
  });

  it("re-claims and re-fires once a claim's own 1-hour timer has expired", async () => {
    const claimsDir = `${statePath()}.claims`;
    await mkdir(claimsDir, { recursive: true });
    // resetAt is still in the future relative to `now` below, but the claim
    // was made over an hour ago (e.g. a re-arm from a shared-window
    // credential switch), so its own timer has expired.
    await writeFile(
      join(claimsDir, "1700000000-5000-30.json"),
      JSON.stringify({ claimedAt: 1_699_994_000 }),
      "utf8",
    );

    await expect(
      evaluateWorktreeGraphqlQuotaWarning(repoKey, bands, sample(), true, 1_699_998_000),
    ).resolves.toMatchObject({ thresholdPercent: 30 });
  });

  it("sweeps claim files whose window has already reset", async () => {
    const claimsDir = `${statePath()}.claims`;
    await mkdir(claimsDir, { recursive: true });
    await writeFile(join(claimsDir, "999-5000-20.json"), "{}", "utf8");

    await expect(
      evaluateWorktreeGraphqlQuotaWarning(repoKey, bands, sample(), true, 1_699_000_000),
    ).resolves.toMatchObject({ thresholdPercent: 30 });

    const remaining = await readdir(claimsDir);
    expect(remaining).not.toContain("999-5000-20.json");
    expect(remaining).toContain("1700000000-5000-30.json");
  });
});
