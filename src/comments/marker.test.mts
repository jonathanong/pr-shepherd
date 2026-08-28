import { describe, expect, it } from "vitest";
import { addPrShepherdMarker, threadEndedByShepherd } from "./marker.mts";

const MARKER = "<!-- pr-shepherd -->";

describe("threadEndedByShepherd", () => {
  it("returns true when the top-level body begins with the marker", () => {
    expect(threadEndedByShepherd({ body: `${MARKER}\nsome reply` })).toBe(true);
  });

  it("returns false when marker appears mid-body (not at start)", () => {
    expect(threadEndedByShepherd({ body: `some text\n${MARKER}` })).toBe(false);
  });

  it("returns false when body has no marker", () => {
    expect(threadEndedByShepherd({ body: "just a regular comment" })).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(threadEndedByShepherd({ body: "" })).toBe(false);
  });

  it("uses the latest transcript comment when comments are present", () => {
    expect(
      threadEndedByShepherd({
        body: "original feedback",
        comments: [{ body: "original feedback" }, { body: `${MARKER}\nhandled` }],
      }),
    ).toBe(true);
  });
});

describe("addPrShepherdMarker", () => {
  it("prepends the marker followed by a newline", () => {
    expect(addPrShepherdMarker("my reply")).toBe(`${MARKER}\nmy reply`);
  });

  it("resulting body is recognized as Shepherd-authored", () => {
    const result = addPrShepherdMarker("some text");
    expect(threadEndedByShepherd({ body: result })).toBe(true);
  });

  it("preserves the original message after the marker", () => {
    const message = "multi\nline\nmessage";
    const result = addPrShepherdMarker(message);
    expect(result.endsWith(message)).toBe(true);
  });
});
