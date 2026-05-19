import { describe, it, expect } from "vitest";
import { buildSessionHeader } from "./session.mts";

describe("buildSessionHeader", () => {
  it("includes the ISO timestamp and command args", () => {
    const { markdown } = buildSessionHeader(["node", "bin/index.mjs", "check", "42"]);
    expect(markdown).toMatch(/^## \d{4}-\d{2}-\d{2}T/);
    expect(markdown).toContain("check 42");
    expect(markdown).toContain("pid:");
    expect(markdown).toContain("version:");
  });

  it("uses (no args) when no subcommand is given", () => {
    const { markdown } = buildSessionHeader(["node", "bin/index.mjs"]);
    expect(markdown).toContain("(no args)");
  });
});
