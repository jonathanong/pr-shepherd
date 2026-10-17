import { describe, expect, it } from "vitest";
import { EXIT } from "../exit-codes.mts";
import { helpKeyForArgs, USAGE } from "./help.mts";

describe("public CLI help surface", () => {
  it("advertises grouped apply/admin commands and hides legacy aliases", () => {
    expect(USAGE.top).toContain("pr-shepherd apply review");
    expect(USAGE.top).toContain("pr-shepherd apply files");
    expect(USAGE.top).toContain("pr-shepherd apply journal");
    expect(USAGE.top).toContain("pr-shepherd journal extract --body-file <path>");
    expect(USAGE.top).toContain("pr-shepherd suggest");
    expect(USAGE.top).toContain("pr-shepherd admin clean");
    expect(USAGE.top).toContain("pr-shepherd admin log-file");
    for (const legacy of ["pr-shepherd poll", "pr-shepherd resolve", "pr-shepherd journal [PR]"]) {
      expect(USAGE.top).not.toContain(legacy);
    }
    expect(USAGE.default).toContain("Usage:\n  pr-shepherd [PR ...] [poll-flags] [iterate-flags]");
    expect(USAGE.top).toContain("pr-shepherd stack PR [--once]");
    expect(USAGE.default).toContain("Use 'pr-shepherd stack PR' for a native GitHub stack.");
    expect(USAGE.default).not.toContain("--stack");
    expect(USAGE.default).not.toContain("--poll-mode");
    expect(USAGE.stack).toContain("pr-shepherd stack PR [--once]");
    expect(USAGE.default).not.toContain("[PR] [PR]");
    expect(USAGE.default).not.toContain("pr-shepherd poll");
    expect(USAGE.top).toContain("--debounce");
    expect(USAGE.default).toContain("--debounce");
    expect(USAGE.top).toContain("Mark selected changed files as viewed");
    expect(USAGE["apply files"]).toContain("Mark selected changed files as viewed");
    for (const removed of [
      "poll",
      "resolve",
      "commit-suggestion",
      "build-suggestion-patch",
      "mark-files-as-viewed",
      "clean",
      "journal",
      "log-file",
      "build-suggestion-patches",
    ]) {
      expect(USAGE).not.toHaveProperty([removed]);
    }
    expect(USAGE.top).toContain("--merge");
    expect(USAGE.top).toContain("15  MERGE");
  });

  it("lists every PR-state exit code on the top-level, default, and stack pages", () => {
    const prStateCodes = Object.values(EXIT).filter((code) => code < 20);
    for (const [page, codes] of [
      [USAGE.top, prStateCodes],
      // SHEPHERD is stack-only, so the default page omits it.
      [USAGE.default, prStateCodes.filter((code) => code !== EXIT.SHEPHERD)],
      [USAGE.stack, [EXIT.SHEPHERD]],
    ] as const) {
      const exitBlock = page!.slice(page!.indexOf("Exit codes:"));
      for (const code of codes) {
        expect(exitBlock).toMatch(new RegExp(`^ {2}${code} +[A-Z_]+`, "m"));
      }
    }
    for (const page of [USAGE.top, USAGE.default]) {
      expect(page).toContain("until READY/TRIAGE/MERGE/CANCEL/ESCALATE or stack SHEPHERD.");
      expect(page).toContain(
        "Settle window after first TRIAGE or stack SHEPHERD before returning.",
      );
    }
  });

  it("resolves nested help pages without doing command I/O", () => {
    expect(helpKeyForArgs(["apply", "review", "--help"])).toBe("apply review");
    expect(helpKeyForArgs(["apply", "files", "-h"])).toBe("apply files");
    expect(helpKeyForArgs(["apply", "journal", "--help"])).toBe("apply journal");
    expect(helpKeyForArgs(["apply", "check-blocker", "--help"])).toBe("apply check-blocker");
    expect(helpKeyForArgs(["journal", "extract", "--help"])).toBe("journal extract");
    expect(helpKeyForArgs(["admin", "clean", "--help"])).toBe("admin clean");
    expect(helpKeyForArgs(["admin", "log-file", "--help"])).toBe("admin log-file");
    expect(helpKeyForArgs(["not-a-command", "--help"])).toBe("top");
  });
});
