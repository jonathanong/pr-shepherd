import { describe, it, expect } from "vitest";
import { formatOutputEntry } from "./session.mts";

describe("formatOutputEntry", () => {
  it("wraps text output in a fenced block", () => {
    const out = formatOutputEntry("hello world\n", "text");
    expect(out).toContain("### Output (text)");
    expect(out).toContain("hello world");
    expect(out).toContain("```");
  });

  it("wraps json output with json lang tag", () => {
    const out = formatOutputEntry('{"status":"ok"}', "json");
    expect(out).toContain("### Output (json)");
    expect(out).toContain("```json");
  });
});
