// @ts-nocheck
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import {
  registerHooks,
  stateDir as stateDirRef,
  mockGetRepoInfo,
  mockGetCurrentBranch,
  mockGetPrNumberForBranch,
  pathExists,
  seedPrDir,
} from "./clean.test-support.mts";
import { runClean } from "./clean.mts";

registerHooks();

const sd = () => stateDirRef as unknown as string;

describe("clean branch", () => {
  it("resolves branch to PR and deletes state", async () => {
    mockGetPrNumberForBranch.mockResolvedValueOnce(55);
    await seedPrDir(sd(), 55);
    const result = await runClean({ variant: "branch", value: "feature/foo" });
    expect(result.ok).toBe(true);
    expect(await pathExists(join(sd(), "acme-widgets", "55"))).toBe(false);
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
    await seedPrDir(sd(), 77);
    const result = await runClean({ variant: "branch" });
    expect(result.ok).toBe(true);
    expect(await pathExists(join(sd(), "acme-widgets", "77"))).toBe(false);
  });

  it("errors on detached HEAD when no value provided", async () => {
    mockGetCurrentBranch.mockResolvedValueOnce("HEAD");
    const result = await runClean({ variant: "branch" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/detached HEAD/);
  });
});

describe("clean current", () => {
  it("uses current branch to resolve PR and deletes state", async () => {
    mockGetCurrentBranch.mockResolvedValueOnce("my-branch");
    mockGetPrNumberForBranch.mockResolvedValueOnce(33);
    await seedPrDir(sd(), 33);
    const result = await runClean({ variant: "current" });
    expect(result.ok).toBe(true);
    expect(await pathExists(join(sd(), "acme-widgets", "33"))).toBe(false);
  });

  it("result variant is 'current'", async () => {
    mockGetPrNumberForBranch.mockResolvedValueOnce(33);
    await seedPrDir(sd(), 33);
    const result = await runClean({ variant: "current" });
    expect(result.variant).toBe("current");
  });
});

describe("clean current — stray positional rejected", () => {
  it("errors when a positional argument is provided to 'current'", async () => {
    const result = await runClean({ variant: "current", value: "feature/foo" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/does not accept a positional/);
  });
});

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
