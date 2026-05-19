import { describe, it, expect } from "vitest";
import { formatCleanResult } from "./clean-formatter.mts";

const base = "/state";
const target = "/state/owner-repo/42";

describe("formatCleanResult", () => {
  it("renders error message when ok is false", () => {
    const result = formatCleanResult({
      ok: false,
      variant: "pr",
      dryRun: false,
      base,
      target,
      deleted: [],
      skipped: [],
      error: "something went wrong",
    });
    expect(result).toBe("Error: something went wrong");
  });

  it("renders unknown error when error is undefined", () => {
    const result = formatCleanResult({
      ok: false,
      variant: "pr",
      dryRun: false,
      base,
      target,
      deleted: [],
      skipped: [],
    });
    expect(result).toBe("Error: unknown error");
  });

  it("renders nothing-to-clean when skipped (non-dry-run)", () => {
    const result = formatCleanResult({
      ok: true,
      variant: "pr",
      dryRun: false,
      base,
      target,
      deleted: [],
      skipped: [target],
    });
    expect(result).toContain("Nothing to clean");
    expect(result).toContain(target);
    expect(result).not.toContain("dry-run");
  });

  it("renders nothing-to-clean with dry-run label when skipped and dryRun", () => {
    const result = formatCleanResult({
      ok: true,
      variant: "pr",
      dryRun: true,
      base,
      target,
      deleted: [],
      skipped: [target],
    });
    expect(result).toContain("Nothing to clean (dry-run)");
  });

  it("renders cleaned paths and summary under normal run", () => {
    const deleted = [`${target}/seen`, `${target}/fix-attempts.json`];
    const result = formatCleanResult({
      ok: true,
      variant: "pr",
      dryRun: false,
      base,
      target,
      deleted,
      skipped: [],
    });
    expect(result).toContain("## Cleaned");
    for (const p of deleted) {
      expect(result).toContain(`- ${p}`);
    }
    expect(result).toContain("Removed 2 item(s)");
  });

  it("renders would-clean heading and summary under dry-run", () => {
    const deleted = [`${target}/seen`];
    const result = formatCleanResult({
      ok: true,
      variant: "pr",
      dryRun: true,
      base,
      target,
      deleted,
      skipped: [],
    });
    expect(result).toContain("## Would clean");
    expect(result).toContain("Would remove 1 item(s)");
    expect(result).toContain(`- ${target}/seen`);
  });

  it("handles empty deleted list (target dir existed but was empty)", () => {
    const result = formatCleanResult({
      ok: true,
      variant: "all",
      dryRun: false,
      base,
      target: base,
      deleted: [],
      skipped: [],
    });
    expect(result).toContain("## Cleaned");
    expect(result).toContain("Removed 0 item(s)");
  });
});
