import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import {
  resolvePrStatePath,
  resolveRepoStateDir,
  resolveStackStatePath,
  resolveStateBase,
} from "./base.mts";

// The default (no override) location is covered in base.user-temp-dir.mock.test.mts.
describe("resolveStateBase", () => {
  const saved = process.env["PR_SHEPHERD_STATE_DIR"];
  afterEach(() => {
    if (saved === undefined) {
      delete process.env["PR_SHEPHERD_STATE_DIR"];
    } else {
      process.env["PR_SHEPHERD_STATE_DIR"] = saved;
    }
  });

  it("returns env var value when set", () => {
    process.env["PR_SHEPHERD_STATE_DIR"] = "/custom/state";
    expect(resolveStateBase()).toBe("/custom/state");
  });

  it("is idempotent for the same env", () => {
    process.env["PR_SHEPHERD_STATE_DIR"] = "/custom/state";
    expect(resolveStateBase()).toBe(resolveStateBase());
  });
});

describe("resolvePrStatePath", () => {
  const saved = process.env["PR_SHEPHERD_STATE_DIR"];
  afterEach(() => {
    if (saved === undefined) {
      delete process.env["PR_SHEPHERD_STATE_DIR"];
    } else {
      process.env["PR_SHEPHERD_STATE_DIR"] = saved;
    }
  });

  it("joins owner, repo, PR number, and extra parts under the state base", () => {
    process.env["PR_SHEPHERD_STATE_DIR"] = "/custom/state";
    expect(resolvePrStatePath({ owner: "acme", repo: "widgets", pr: 42 }, "seen")).toBe(
      join("/custom/state", "acme", "widgets", "42", "seen"),
    );
  });

  it("keeps hyphenated owner and repo names in separate segments", () => {
    process.env["PR_SHEPHERD_STATE_DIR"] = "/custom/state";
    const labsWidgets = resolveRepoStateDir({ owner: "acme-labs", repo: "widgets" });
    const acmeLabs = resolveRepoStateDir({ owner: "acme", repo: "labs-widgets" });
    expect(labsWidgets).toBe(join("/custom/state", "acme-labs", "widgets"));
    expect(acmeLabs).toBe(join("/custom/state", "acme", "labs-widgets"));
    expect(labsWidgets).not.toBe(acmeLabs);
  });

  it("accepts a repository name that contains dots", () => {
    process.env["PR_SHEPHERD_STATE_DIR"] = "/custom/state";
    expect(resolveRepoStateDir({ owner: "acme", repo: "my.repo" })).toBe(
      join("/custom/state", "acme", "my.repo"),
    );
  });

  it.each([".", ".."])("rejects owner segment %s", (owner) => {
    expect(() => resolveRepoStateDir({ owner, repo: "widgets" })).toThrow(
      'Invalid state key segment "owner"',
    );
  });

  it("rejects repo segment ..", () => {
    expect(() => resolveRepoStateDir({ owner: "acme", repo: ".." })).toThrow(
      'Invalid state key segment "repo"',
    );
  });

  it("rejects owner with a slash", () => {
    expect(() => resolvePrStatePath({ owner: "a/b", repo: "repo", pr: 1 })).toThrow(
      'Invalid state key segment "owner"',
    );
  });

  it("rejects repo with a space", () => {
    expect(() => resolvePrStatePath({ owner: "owner", repo: "my repo", pr: 1 })).toThrow(
      'Invalid state key segment "repo"',
    );
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["decimal", 1.5],
    ["NaN", Number.NaN],
    ["traversal string", "../../etc" as unknown as number],
  ])("rejects pr %s", (_label, pr) => {
    expect(() => resolvePrStatePath({ owner: "owner", repo: "repo", pr })).toThrow(
      'Invalid state key segment "pr"',
    );
  });

  it("rejects an unsafe extra path part", () => {
    expect(() => resolvePrStatePath({ owner: "o", repo: "r", pr: 1 }, "a/b")).toThrow(
      "Invalid state key segment",
    );
  });
});

describe("resolveStackStatePath", () => {
  const saved = process.env["PR_SHEPHERD_STATE_DIR"];
  afterEach(() => {
    if (saved === undefined) {
      delete process.env["PR_SHEPHERD_STATE_DIR"];
    } else {
      process.env["PR_SHEPHERD_STATE_DIR"] = saved;
    }
  });

  it("keeps a stack directory beside the per-PR directories", () => {
    process.env["PR_SHEPHERD_STATE_DIR"] = "/custom/state";
    expect(resolveStackStatePath({ owner: "acme", repo: "widgets", stack: 7 }, "stall.json")).toBe(
      join("/custom/state", "acme", "widgets", "stack-7", "stall.json"),
    );
  });

  it.each([
    ["zero", 0],
    ["traversal string", "../../etc" as unknown as number],
  ])("rejects stack %s", (_label, stack) => {
    expect(() => resolveStackStatePath({ owner: "owner", repo: "repo", stack })).toThrow(
      'Invalid state key segment "stack"',
    );
  });
});
