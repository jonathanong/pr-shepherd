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

  it("quotes arbitrary literal arguments without expanding shell syntax", () => {
    expect(renderShellCommand(["Bob's $build"])).toBe("'Bob'\"'\"'s $build'");
  });

  it("expands an uppercase variable used as an assignment value", () => {
    expect(renderShellCommand(["expectedHeadOid=$HEAD_SHA"])).toBe('expectedHeadOid="$HEAD_SHA"');
  });
});
