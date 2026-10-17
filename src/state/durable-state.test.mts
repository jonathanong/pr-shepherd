import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { durableStateRequested, resolveDurableStateBase } from "./durable-state.mts";
import { runWithExecutionCwd } from "../execution-context.mts";
import { resolveStateBase } from "./base.mts";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("durable state", () => {
  it("is off by default", () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "");
    expect(durableStateRequested()).toBe(false);
    expect(resolveDurableStateBase()).toBeNull();
  });

  it("is requested in a cloud session", () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    expect(durableStateRequested()).toBe(true);
  });

  it("resolves under the git common dir and survives a TMPDIR change", () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    vi.stubEnv("PR_SHEPHERD_STATE_DIR", "");
    delete process.env["PR_SHEPHERD_STATE_DIR"];
    const base = resolveDurableStateBase();
    expect(base).toMatch(/pr-shepherd-state$/);
    expect(base).not.toContain(tmpdir());
    vi.stubEnv("TMPDIR", mkdtempSync(join(tmpdir(), "elsewhere-")));
    expect(resolveStateBase()).toBe(base);
  });

  it("lets PR_SHEPHERD_STATE_DIR win", () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    vi.stubEnv("PR_SHEPHERD_STATE_DIR", "/custom/state");
    expect(resolveStateBase()).toBe("/custom/state");
  });

  it("returns null outside a git repository", () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "no-git-")));
    mkdirSync(join(dir, "sub"));
    vi.stubEnv("GIT_CEILING_DIRECTORIES", dir);
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    runWithExecutionCwd(join(dir, "sub"), () => {
      expect(resolveDurableStateBase()).toBeNull();
      expect(resolveDurableStateBase()).toBeNull();
    });
  });
});
