import { describe, expect, it } from "vitest";
import { PR_SHEPHERD_MARKER, hasPrShepherdMarker, addPrShepherdMarker } from "./marker.mts";

describe("hasPrShepherdMarker", () => {
  it("returns true when body contains the marker", () => {
    expect(hasPrShepherdMarker(`${PR_SHEPHERD_MARKER}\nsome reply`)).toBe(true);
  });

  it("returns true when marker appears at the end", () => {
    expect(hasPrShepherdMarker(`some text\n${PR_SHEPHERD_MARKER}`)).toBe(true);
  });

  it("returns false when body has no marker", () => {
    expect(hasPrShepherdMarker("just a regular comment")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(hasPrShepherdMarker("")).toBe(false);
  });
});

describe("addPrShepherdMarker", () => {
  it("prepends the marker followed by a newline", () => {
    expect(addPrShepherdMarker("my reply")).toBe(`${PR_SHEPHERD_MARKER}\nmy reply`);
  });

  it("resulting body contains the marker", () => {
    const result = addPrShepherdMarker("some text");
    expect(hasPrShepherdMarker(result)).toBe(true);
  });

  it("preserves the original message after the marker", () => {
    const message = "multi\nline\nmessage";
    const result = addPrShepherdMarker(message);
    expect(result.endsWith(message)).toBe(true);
  });
});
