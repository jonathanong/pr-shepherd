// @ts-nocheck
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { mkdir, rm } from "node:fs/promises";
import {
  registerHooks,
  stateDir as stateDirRef,
  pathExists,
  seedPrDir,
} from "./clean.test-support.mts";
import { runClean } from "./clean.mts";

registerHooks();

// Use a getter so tests always read the current per-test value.
const sd = () => (stateDirRef as unknown as string);

describe("clean all", () => {
  it("deletes the entire state base", async () => {
    await mkdir(join(sd(), "acme-widgets", "42"), { recursive: true });
    const result = await runClean({ variant: "all" });
    expect(result.ok).toBe(true);
    expect(result.deleted).toHaveLength(1);
    expect(await pathExists(sd())).toBe(false);
  });

  it("returns skipped when state base does not exist", async () => {
    await rm(sd(), { recursive: true, force: true });
    const result = await runClean({ variant: "all" });
    expect(result.ok).toBe(true);
    expect(result.deleted).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
  });

  it("dry-run lists entries without deleting", async () => {
    await mkdir(join(sd(), "acme-widgets", "42"), { recursive: true });
    const result = await runClean({ variant: "all", dryRun: true });
    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.deleted).toHaveLength(1);
    expect(await pathExists(sd())).toBe(true);
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
      target: sd(),
    });
  });
});

describe("clean repo", () => {
  it("deletes the owner-repo directory", async () => {
    await seedPrDir(sd(), 42);
    const result = await runClean({ variant: "repo" });
    expect(result.ok).toBe(true);
    expect(result.deleted.length).toBeGreaterThan(0);
    expect(await pathExists(join(sd(), "acme-widgets"))).toBe(false);
  });

  it("returns skipped when repo dir does not exist", async () => {
    const result = await runClean({ variant: "repo" });
    expect(result.ok).toBe(true);
    expect(result.deleted).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
  });

  it("dry-run lists entries without deleting", async () => {
    await seedPrDir(sd(), 42);
    const result = await runClean({ variant: "repo", dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.deleted.length).toBeGreaterThan(0);
    expect(await pathExists(join(sd(), "acme-widgets"))).toBe(true);
  });

  it("target is set to base/owner-repo", async () => {
    const result = await runClean({ variant: "repo" });
    expect(result.target).toBe(join(sd(), "acme-widgets"));
  });
});
