import { describe, expect, it } from "vitest";
import { hasPrShepherdMarker, addPrShepherdMarker } from "./marker.mts";

const MARKER = "<!-- pr-shepherd -->";

describe("hasPrShepherdMarker", () => {
  it("returns true when body contains the marker", () => {
    expect(hasPrShepherdMarker(`${MARKER}\nsome reply`)).toBe(true);
  });

  it("returns true when marker appears at the end", () => {
    expect(hasPrShepherdMarker(`some text\n${MARKER}`)).toBe(true);
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
    expect(addPrShepherdMarker("my reply")).toBe(`${MARKER}\nmy reply`);
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
