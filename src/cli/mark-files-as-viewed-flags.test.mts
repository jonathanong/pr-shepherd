import { describe, expect, it } from "vitest";
import { parseMarkFilesAsViewedArgs } from "./mark-files-as-viewed-flags.mts";

describe("parseMarkFilesAsViewedArgs", () => {
  it("parses paths, tests, and repeated match patterns", () => {
    expect(
      parseMarkFilesAsViewedArgs(["src/a.ts", "--tests", "--match", "^docs/", "--match=\\.md$"]),
    ).toEqual({
      ok: true,
      files: ["src/a.ts"],
      tests: true,
      matchPatterns: ["^docs/", "\\.md$"],
    });
  });

  it("rejects missing --match values", () => {
    expect(parseMarkFilesAsViewedArgs(["--match"])).toEqual({
      ok: false,
      error: "--match requires a regex value",
    });
    expect(parseMarkFilesAsViewedArgs(["--match", "--tests"])).toEqual({
      ok: false,
      error: "--match requires a regex value",
    });
  });

  it("rejects empty inline match and unknown flags", () => {
    expect(parseMarkFilesAsViewedArgs(["--match="])).toEqual({
      ok: false,
      error: "--match requires a regex value",
    });
    expect(parseMarkFilesAsViewedArgs(["--glob", "src"])).toEqual({
      ok: false,
      error: 'unknown flag: "--glob"',
    });
  });

  it("requires at least one selector", () => {
    expect(parseMarkFilesAsViewedArgs([])).toEqual({
      ok: false,
      error: "provide at least one file, --tests, or --match <regex>",
    });
  });
});
