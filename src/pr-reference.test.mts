import { describe, expect, it } from "vitest";
import {
  formatPrUrl,
  isRepositoryQualifiedPrReference,
  parseCliPrReference,
  parsePrReference,
  resolveParsedPrTarget,
} from "./pr-reference.mts";

describe("pull-request references", () => {
  it.each([
    ["owner/repo#42", { number: 42, repository: "owner/repo" }],
    ["https://github.com/owner/repo/pull/42", { number: 42, repository: "owner/repo" }],
    [
      "https://www.github.com/fork/widgets/pull/42#discussion_r123",
      { number: 42, repository: "fork/widgets" },
    ],
  ])("parses qualified reference %s", (reference, expected) => {
    expect(parsePrReference(reference)).toEqual(expected);
    expect(isRepositoryQualifiedPrReference(reference)).toBe(true);
  });

  it.each(["42", "https://example.com/owner/repo/pull/42", "owner/repo#0", "owner#42"])(
    "rejects unqualified or invalid reference %s",
    (reference) => {
      expect(parsePrReference(reference)).toBeNull();
      expect(isRepositoryQualifiedPrReference(reference)).toBe(false);
    },
  );

  it("parses bare CLI numbers while preserving qualified repository targets", () => {
    expect(parseCliPrReference("42")).toEqual({ number: 42 });
    expect(resolveParsedPrTarget(parseCliPrReference("fork/widgets#42")!)).toEqual({
      prNumber: 42,
      targetRepository: { owner: "fork", name: "widgets" },
    });
  });

  it("formats a canonical collision-safe URL for generated commands", () => {
    expect(formatPrUrl("fork/widgets", 42)).toBe("https://github.com/fork/widgets/pull/42");
  });
});
