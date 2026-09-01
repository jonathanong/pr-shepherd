import { describe, expect, it } from "vitest";
import { helpKeyForArgs, USAGE } from "./help.mts";

describe("public CLI help surface", () => {
  it("advertises grouped apply/admin commands and hides legacy aliases", () => {
    expect(USAGE.top).toContain("pr-shepherd apply review");
    expect(USAGE.top).toContain("pr-shepherd apply files");
    expect(USAGE.top).toContain("pr-shepherd apply journal");
    expect(USAGE.top).toContain("pr-shepherd journal extract --body-file <path>");
    expect(USAGE.top).toContain("pr-shepherd build-suggestion-patches");
    expect(USAGE.top).toContain("pr-shepherd admin clean");
    expect(USAGE.top).toContain("pr-shepherd admin log-file");
    for (const legacy of ["pr-shepherd poll", "pr-shepherd resolve", "pr-shepherd journal [PR]"]) {
      expect(USAGE.top).not.toContain(legacy);
    }
    expect(USAGE.default).toContain("Usage:\n  pr-shepherd [PR] [poll-flags] [iterate-flags]");
    expect(USAGE.default).not.toContain("[PR] [PR]");
    expect(USAGE.default).not.toContain("pr-shepherd poll");
    expect(USAGE.poll).toContain("Usage:\n  pr-shepherd poll [PR] [poll-flags] [iterate-flags]");
    expect(USAGE.top).toContain("--debounce");
    expect(USAGE.default).toContain("--debounce");
    expect(USAGE.poll).toContain("--debounce");
    expect(USAGE.top).toContain("Mark selected changed files as viewed");
    expect(USAGE["apply files"]).toContain("Mark selected changed files as viewed");
    expect(USAGE["mark-files-as-viewed"]).toContain("marking selected PR files as viewed");
  });

  it("resolves nested help pages without doing command I/O", () => {
    expect(helpKeyForArgs(["apply", "review", "--help"])).toBe("apply review");
    expect(helpKeyForArgs(["apply", "files", "-h"])).toBe("apply files");
    expect(helpKeyForArgs(["apply", "journal", "--help"])).toBe("apply journal");
    expect(helpKeyForArgs(["journal", "extract", "--help"])).toBe("journal extract");
    expect(helpKeyForArgs(["admin", "clean", "--help"])).toBe("admin clean");
    expect(helpKeyForArgs(["admin", "log-file", "--help"])).toBe("admin log-file");
    expect(helpKeyForArgs(["not-a-command", "--help"])).toBe("top");
  });
});
