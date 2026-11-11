import { describe, expect, it, vi } from "vitest";
import { createHealth } from "./health.mts";

describe("createHealth", () => {
  it("notes each state change once", () => {
    const note = vi.fn();
    const health = createHealth(note);
    health.markHealthy();
    health.markUnhealthy("a");
    health.markUnhealthy("b");
    health.markHealthy();
    health.markUncovered("Acme", "403");
    health.markUncovered("acme", "403");
    expect(note.mock.calls.map(([message]) => message)).toEqual([
      "events: source unhealthy (a); polling normally until it recovers",
      "events: source recovered",
      "events: Acme is not covered by this token (403); polling it normally",
    ]);
    expect(health.covers([{ repo: "acme/x", pr: 1 }])).toBe(false);
  });
});
