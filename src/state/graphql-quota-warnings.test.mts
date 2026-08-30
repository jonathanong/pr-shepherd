import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphqlApiUsage } from "../types.mts";
import { evaluateWorktreeGraphqlQuotaWarning } from "./graphql-quota-warnings.mts";
import { evaluateGraphqlQuotaWarning } from "./graphql-quota-policy.mts";

const testState = vi.hoisted(() => ({ base: "" }));
const fsState = vi.hoisted(() => ({ delay: false, didDelay: false, fail: false }));
const worktreeState = vi.hoisted(() => ({ failGetWorktreeKey: false }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    rename: async (...args: Parameters<typeof actual.rename>) => {
      if (fsState.delay && !fsState.didDelay) {
        fsState.didDelay = true;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (fsState.fail) throw new Error("rename failed");
      return actual.rename(...args);
    },
  };
});

vi.mock("./base.mts", () => ({
  resolveStateBase: () => testState.base,
}));

vi.mock("../util/worktree.mts", () => ({
  getWorktreeKey: async () =>
    worktreeState.failGetWorktreeKey
      ? Promise.reject(new Error("not a git worktree"))
      : "fixture-worktree",
}));

const bands = [
  { remainingPercent: 30, pollIntervalMinutes: 2 },
  { remainingPercent: 20, pollIntervalMinutes: 5 },
  { remainingPercent: 10, pollIntervalMinutes: 10 },
];

const repoKey = { owner: "acme", repo: "repo" };
const stateFile = "fixture-worktree-graphql-quota-warnings.json";

function statePath() {
  return join(testState.base, "acme-repo", "worktrees", stateFile);
}

function sample(remaining: number, used = 5000 - remaining): GraphqlApiUsage {
  return {
    resource: "graphql",
    requestCount: 1,
    limit: 5000,
    used,
    remaining,
    resetAt: 1_700_000_000,
    measuredQueryCost: 1,
    unmeasuredRequestCount: 0,
    nodeCount: 1,
  };
}

beforeEach(async () => {
  fsState.delay = false;
  fsState.didDelay = false;
  fsState.fail = false;
  worktreeState.failGetWorktreeKey = false;
  testState.base = await mkdtemp(join(tmpdir(), "pr-shepherd-quota-warning-"));
});

afterEach(async () => {
  await rm(testState.base, { recursive: true, force: true });
});

describe("evaluateWorktreeGraphqlQuotaWarning", () => {
  it("returns no warning without configured bands", async () => {
    await expect(
      evaluateWorktreeGraphqlQuotaWarning(repoKey, [], sample(1400), true),
    ).resolves.toBeUndefined();
  });

  it("persists warning state and suppresses a repeated threshold", async () => {
    const first = await evaluateWorktreeGraphqlQuotaWarning(repoKey, bands, sample(1400), true);
    expect(first?.thresholdPercent).toBe(30);
    await expect(readFile(statePath(), "utf8")).resolves.toMatch(/"warnedThresholds":\[30\]/);

    const repeat = await evaluateWorktreeGraphqlQuotaWarning(repoKey, bands, sample(1300), true);
    expect(repeat).toBeUndefined();
  });

  it("evaluates without persisting when requested", async () => {
    const warning = await evaluateWorktreeGraphqlQuotaWarning(repoKey, bands, sample(1400), false);

    expect(warning?.thresholdPercent).toBe(30);
    await expect(readFile(statePath(), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("keeps one-time warning state in memory when worktree discovery fails", async () => {
    worktreeState.failGetWorktreeKey = true;

    await expect(
      evaluateWorktreeGraphqlQuotaWarning(repoKey, bands, sample(1400), true),
    ).resolves.toMatchObject({ thresholdPercent: 30 });
    await expect(
      evaluateWorktreeGraphqlQuotaWarning(repoKey, bands, sample(1300), true),
    ).resolves.toBeUndefined();
  });

  it("ignores malformed persisted state", async () => {
    await mkdir(join(testState.base, "acme-repo", "worktrees"), { recursive: true });
    await writeFile(statePath(), JSON.stringify({ resource: "graphql" }), "utf8");

    const warning = await evaluateWorktreeGraphqlQuotaWarning(repoKey, bands, sample(1400), false);

    expect(warning?.thresholdPercent).toBe(30);
  });

  it("rejects unsafe repository path segments", async () => {
    await expect(
      evaluateWorktreeGraphqlQuotaWarning(
        { owner: "../unsafe", repo: "repo" },
        bands,
        sample(1400),
        false,
      ),
    ).rejects.toThrow("Invalid repo key segments: ../unsafe/repo");
  });

  it("keeps warning evaluation best-effort when state cannot be written", async () => {
    const blockedBase = join(testState.base, "blocked");
    await writeFile(blockedBase, "not a directory", "utf8");
    testState.base = blockedBase;

    const warning = await evaluateWorktreeGraphqlQuotaWarning(repoKey, bands, sample(1400), true);

    expect(warning?.thresholdPercent).toBe(30);
  });

  it("removes a temporary state file when the atomic rename fails", async () => {
    fsState.fail = true;

    const warning = await evaluateWorktreeGraphqlQuotaWarning(repoKey, bands, sample(1400), true);

    expect(warning?.thresholdPercent).toBe(30);
    await expect(readFile(statePath(), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("serializes persistent updates for the same worktree", async () => {
    const [first, duplicate] = await Promise.all([
      evaluateWorktreeGraphqlQuotaWarning(repoKey, bands, sample(1400), true),
      evaluateWorktreeGraphqlQuotaWarning(repoKey, bands, sample(1400), true),
    ]);

    expect([first?.thresholdPercent, duplicate?.thresholdPercent]).toEqual([30, undefined]);

    fsState.delay = true;
    const [next, lowest] = await Promise.all([
      evaluateWorktreeGraphqlQuotaWarning(repoKey, bands, sample(900), true),
      evaluateWorktreeGraphqlQuotaWarning(repoKey, bands, sample(400), true),
    ]);

    expect([next?.thresholdPercent, lowest?.thresholdPercent]).toEqual([20, 10]);
    await expect(readFile(statePath(), "utf8")).resolves.toMatch(/"warnedThresholds":\[30,20,10\]/);
  });
});
describe("evaluateGraphqlQuotaWarning", () => {
  it("emits the current band and marks skipped higher bands as crossed", () => {
    const result = evaluateGraphqlQuotaWarning(bands, sample(1250), null);
    expect(result.warning).toMatchObject({
      thresholdPercent: 30,
      pollIntervalMinutes: 2,
      pollTimeoutMinutes: 4,
      remaining: 1250,
      limit: 5000,
    });
    expect(result.state.warnedThresholds).toEqual([30]);
  });

  it("emits only the lowest applicable band on a first observation", () => {
    const result = evaluateGraphqlQuotaWarning(bands, sample(250), null);
    expect(result.warning?.thresholdPercent).toBe(10);
    expect(result.warning?.pollIntervalMinutes).toBe(10);
    expect(result.state.warnedThresholds).toEqual([30, 20, 10]);
  });

  it("warns once per band and advances at the next crossing", () => {
    const first = evaluateGraphqlQuotaWarning(bands, sample(1400), null);
    const repeat = evaluateGraphqlQuotaWarning(bands, sample(1300), first.state);
    const next = evaluateGraphqlQuotaWarning(bands, sample(900), repeat.state);
    expect(first.warning?.thresholdPercent).toBe(30);
    expect(repeat.warning).toBeUndefined();
    expect(next.warning?.thresholdPercent).toBe(20);
  });
});
