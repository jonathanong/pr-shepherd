import { describe, expect, it } from "vitest";
import { formatJournalResult } from "./journal-formatter.mts";

describe("formatJournalResult", () => {
  it("renders an authorization skip", () => {
    expect(
      formatJournalResult({
        prNumber: 42,
        mutated: false,
        sectionExisted: false,
        dryRun: false,
        authorizationSkipped: "denied-or-unverifiable",
      }),
    ).toContain("Authorization denied or unverifiable");
  });
});
