// @ts-nocheck
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import {
  registerHooks,
  stateDir as stateDirRef,
  mockGetCurrentPrNumber,
  pathExists,
  seedPrDir,
} from "./clean.test-support.mts";
import { runClean } from "./clean.mts";

registerHooks();

const sd = () => (stateDirRef as unknown as string);

describe("clean pr (explicit number)", () => {
  it("deletes the PR state directory", async () => {
    await seedPrDir(sd(), 42);
    const result = await runClean({ variant: "pr", value: "42" });
    expect(result.ok).toBe(true);
    expect(result.deleted.length).toBeGreaterThan(0);
    expect(await pathExists(join(sd(), "acme-widgets", "42"))).toBe(false);
  });

  it("leaves other PRs intact", async () => {
    await seedPrDir(sd(), 42);
    await seedPrDir(sd(), 99);
    await runClean({ variant: "pr", value: "42" });
    expect(await pathExists(join(sd(), "acme-widgets", "99"))).toBe(true);
  });

  it("dry-run lists contents without deleting", async () => {
    await seedPrDir(sd(), 42);
    const result = await runClean({ variant: "pr", value: "42", dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.deleted.length).toBeGreaterThan(0);
    expect(await pathExists(join(sd(), "acme-widgets", "42"))).toBe(true);
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

describe("clean pr (inferred from current branch)", () => {
  it("resolves current PR and deletes its state", async () => {
    await seedPrDir(sd(), 42);
    const result = await runClean({ variant: "pr" });
    expect(result.ok).toBe(true);
    expect(await pathExists(join(sd(), "acme-widgets", "42"))).toBe(false);
  });

  it("errors when no open PR found for current branch", async () => {
    mockGetCurrentPrNumber.mockResolvedValueOnce(null);
    const result = await runClean({ variant: "pr" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/No open PR/);
  });
});
