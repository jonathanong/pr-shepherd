import { describe, expect, it } from "vitest";
import { harness, hit, miss } from "../../test-helpers/events/waiter.test-support.mts";

describe("createEventWaiter", () => {
  it("waits for the fallback interval, not the plain sleep, when healthy and quiet", async () => {
    const h = harness([{ events: [miss("a")] }, { events: [] }]);
    const start = h.now();
    const outcome = await h.waiter.wait(h.request());
    expect(outcome).toEqual({ wake: { kind: "timer" }, degraded: false });
    expect(h.now() - start).toBe(300_000);
    expect(h.polls[1]!.at - h.polls[0]!.at).toBe(15_000);
  });

  it("never waits less than the plain sleep when the fallback is shorter", async () => {
    const h = harness([{ events: [] }], { fallbackMs: 30_000 });
    const start = h.now();
    await h.waiter.wait(h.request({ sleepMs: 120_000 }));
    expect(h.now() - start).toBe(120_000);
  });

  it("wakes on a matching event after the settle window", async () => {
    const h = harness([{ events: [] }, { events: [hit] }]);
    const start = h.now();
    const outcome = await h.waiter.wait(h.request({ tickStartedAt: start - 60_000 }));
    expect(outcome.wake).toEqual({ kind: "event", event: hit });
    expect(h.now() - start).toBe(25_000);
  });

  it("never starts the next tick sooner than the gap after the previous one started", async () => {
    const h = harness([{ events: [hit] }]);
    const start = h.now();
    await h.waiter.wait(h.request({ tickStartedAt: start, minGapMs: 120_000 }));
    expect(h.now() - start).toBe(120_000);
  });

  it("keeps the larger quota-band floor over the settle window", async () => {
    const h = harness([{ events: [hit] }]);
    const start = h.now();
    await h.waiter.wait(h.request({ tickStartedAt: start, minGapMs: 600_000, sleepMs: 600_000 }));
    expect(h.now() - start).toBe(600_000);
  });

  it("caps the settle and gap at the poll window", async () => {
    const h = harness([{ events: [] }, { events: [hit] }]);
    const start = h.now();
    await h.waiter.wait(h.request({ windowMs: 20_000, minGapMs: 120_000 }));
    expect(h.now() - start).toBe(20_000);
  });

  it("caps the deadline at the window when no event arrives", async () => {
    const h = harness([{ events: [] }]);
    const start = h.now();
    const outcome = await h.waiter.wait(h.request({ windowMs: 100_000 }));
    expect(outcome.wake.kind).toBe("timer");
    expect(h.now() - start).toBe(100_000);
  });

  it("keeps the plain recheck cadence while GitHub recomputes mergeability", async () => {
    const h = harness([{ events: [] }]);
    const start = h.now();
    await h.waiter.wait(h.request({ recheck: true }));
    expect(h.now() - start).toBe(60_000);
  });
});
