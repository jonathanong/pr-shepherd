import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  durableStateRequested,
  resolveDurableStateBase,
  runWithDurableState,
} from "./durable-state.mts";
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

  it("is requested in a cloud session or an explicit scope", () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    expect(durableStateRequested()).toBe(true);
    vi.stubEnv("CLAUDE_CODE_REMOTE", "");
    expect(runWithDurableState(() => durableStateRequested())).toBe(true);
  });

  it("resolves under the git common dir and survives a TMPDIR change", () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "");
    vi.stubEnv("PR_SHEPHERD_STATE_DIR", "");
    delete process.env["PR_SHEPHERD_STATE_DIR"];
    const base = runWithDurableState(() => resolveDurableStateBase());
    expect(base).toMatch(/pr-shepherd-state$/);
    expect(base).not.toContain(tmpdir());
    vi.stubEnv("TMPDIR", mkdtempSync(join(tmpdir(), "elsewhere-")));
    expect(runWithDurableState(() => resolveStateBase())).toBe(base);
  });

  it("lets PR_SHEPHERD_STATE_DIR win", () => {
    vi.stubEnv("PR_SHEPHERD_STATE_DIR", "/custom/state");
    expect(runWithDurableState(() => resolveStateBase())).toBe("/custom/state");
  });

  it("returns null outside a git repository", () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "no-git-")));
    mkdirSync(join(dir, "sub"));
    vi.stubEnv("GIT_CEILING_DIRECTORIES", dir);
    runWithExecutionCwd(join(dir, "sub"), () => {
      expect(runWithDurableState(() => resolveDurableStateBase())).toBeNull();
      expect(runWithDurableState(() => resolveDurableStateBase())).toBeNull();
    });
  });
});
