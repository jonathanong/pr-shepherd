import { describe, it, expect } from "vitest";
import { formatNextCheckLines, formatPollModeSegment } from "./next-check-format.mts";

describe("next-check formatting", () => {
  it("omits everything when not applicable", () => {
    expect(formatPollModeSegment({})).toBe("");
    expect(formatNextCheckLines(undefined)).toEqual([]);
  });

  it("renders poll mode and the next check", () => {
    expect(formatPollModeSegment({ pollMode: "event" })).toBe(" · **pollMode** `event`");
    expect(
      formatNextCheckLines({
        at: "2024-05-15T19:09:00Z",
        inSeconds: 140,
        reason: "ready-delay",
        eventDriven: false,
      }),
    ).toEqual(["**nextCheck** `2024-05-15T19:09:00Z` · in 140s · reason `ready-delay`"]);
    expect(
      formatNextCheckLines({
        at: "2024-05-15T19:57:00Z",
        inSeconds: 3020,
        reason: "safety-net",
        eventDriven: true,
      })[0],
    ).toContain("event-driven");
  });
});
