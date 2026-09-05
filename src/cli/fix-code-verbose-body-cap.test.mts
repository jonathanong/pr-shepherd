import { describe, expect, it } from "vitest";

import { formatIterateResult } from "./iterate-formatter.mts";
import { makeIterateResult } from "../../fixtures/cli-parser.iterate-fixtures.mts";
import type { IterateResult } from "../types.mts";

describe("FIX_CODE body cap — --verbose bypass", () => {
  it("caps a long actionable-comment body by default", () => {
    const result: IterateResult = { ...makeIterateResult("fix_code") };
    if (result.action !== "fix_code") throw new Error("expected fix_code fixture");
    const longBody = Array.from({ length: 200 }, (_, i) => `line ${i} padded with extra text`).join(
      "\n",
    );
    result.fix.actionableComments = [{ id: "c1", author: "bot", body: longBody, url: "" }];

    const output = formatIterateResult(result);

    expect(output).toContain("chars elided");
  });

  it("renders the same body uncapped with --verbose", () => {
    const result: IterateResult = { ...makeIterateResult("fix_code") };
    if (result.action !== "fix_code") throw new Error("expected fix_code fixture");
    const longBody = Array.from({ length: 200 }, (_, i) => `line ${i} padded with extra text`).join(
      "\n",
    );
    result.fix.actionableComments = [{ id: "c1", author: "bot", body: longBody, url: "" }];

    const output = formatIterateResult(result, { verbose: true });

    expect(output).not.toContain("chars elided");
    expect(output).toContain("line 0 padded");
    expect(output).toContain("line 199 padded");
  });
});
