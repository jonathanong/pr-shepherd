import { describe, it, expect } from "vitest";

import { buildPrShepherdCommand, renderShellCommand } from "./runner.mts";

describe("buildPrShepherdCommand", () => {
  it("renders direct pr-shepherd commands", () => {
    expect(buildPrShepherdCommand(["42"])).toEqual({
      argv: ["pr-shepherd", "42"],
      text: "pr-shepherd 42",
    });
  });

  it("quotes shell placeholders and whitespace-bearing args", () => {
    expect(renderShellCommand(["--message", "$DISMISS_MESSAGE", "hello world"])).toBe(
      '--message "$DISMISS_MESSAGE" "hello world"',
    );
  });

  it("single-quotes args with double quotes or dollar signs when possible", () => {
    expect(renderShellCommand(["--message", 'hello "$USER"'])).toBe("--message 'hello \"$USER\"'");
  });

  it("throws for args that cannot be safely quoted", () => {
    expect(() => renderShellCommand(["can't use $USER"])).toThrow("Unexpected character");
  });
});
