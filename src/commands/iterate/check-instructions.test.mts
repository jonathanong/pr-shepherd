import { describe, it, expect } from "vitest";
import { buildBehindBaseHintInstruction } from "./check-instructions.mts";

describe("buildBehindBaseHintInstruction", () => {
  it("renders the hint when behind and configured", () => {
    expect(buildBehindBaseHintInstruction("main", "rebase --force-with-lease", true)).toEqual([
      "The branch is behind `origin/main` — rebase --force-with-lease before pushing.",
    ]);
  });

  it("returns empty when not behind", () => {
    expect(buildBehindBaseHintInstruction("main", "rebase --force-with-lease", false)).toEqual([]);
  });

  it("returns empty when the hint is empty", () => {
    expect(buildBehindBaseHintInstruction("main", "", true)).toEqual([]);
  });

  it("trims surrounding whitespace from the configured hint", () => {
    expect(buildBehindBaseHintInstruction("main", "  rebase  ", true)).toEqual([
      "The branch is behind `origin/main` — rebase before pushing.",
    ]);
  });

  it("treats a whitespace-only hint as unconfigured", () => {
    expect(buildBehindBaseHintInstruction("main", "   ", true)).toEqual([]);
  });

  it("treats a non-string hint from a malformed rc file as unconfigured", () => {
    // yaml parsing does not enforce the TS type at runtime (e.g. `behindBaseHint: true`).
    const malformed = true as unknown as string;
    expect(buildBehindBaseHintInstruction("main", malformed, true)).toEqual([]);
  });
});
