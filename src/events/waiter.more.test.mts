import { describe, expect, it } from "vitest";
import { harness, hit, miss, target } from "../../test-helpers/events/waiter.test-support.mts";

describe("createEventWaiter (health, dedupe, scopes)", () => {
  it("degrades to the plain sleep, once, when the source is unhealthy", async () => {
    const h = harness([{ events: [], unhealthy: "relay answered HTTP 503" }]);
    const start = h.now();
    const outcome = await h.waiter.wait(h.request());
    expect(outcome).toEqual({ wake: { kind: "timer" }, degraded: true });
    expect(h.now() - start).toBe(60_000);
    expect(h.polls).toHaveLength(1);
    expect(h.notes).toEqual([
      "events: source unhealthy (relay answered HTTP 503); polling normally until it recovers",
    ]);
  });

  it("retries the source on the next wait and notes the recovery once", async () => {
    const h = harness([{ events: [], unhealthy: "gap" }, { events: [] }]);
    await h.waiter.wait(h.request());
    await h.waiter.wait(h.request({ windowMs: 1_000 }));
    await h.waiter.wait(h.request({ windowMs: 1_000 }));
    expect(h.notes.map((note) => note.replace(/\(.*\)/, "()"))).toEqual([
      "events: source unhealthy (); polling normally until it recovers",
      "events: source recovered",
    ]);
  });

  it("still wakes on a matching event delivered alongside an unhealthy flag", async () => {
    const h = harness([{ events: [hit], unhealthy: "gap" }]);
    const outcome = await h.waiter.wait(h.request({ tickStartedAt: 0 }));
    expect(outcome).toMatchObject({ wake: { kind: "event" }, degraded: true });
  });

  it("stops engaging for an owner the token cannot read, noting it once", async () => {
    const h = harness([
      { events: [], uncovered: [{ owner: "acme", reason: "relay answered HTTP 403" }] },
    ]);
    expect(h.waiter.engaged([target])).toBe(true);
    const start = h.now();
    const outcome = await h.waiter.wait(h.request());
    expect(outcome.degraded).toBe(true);
    expect(h.now() - start).toBe(60_000);
    expect(h.waiter.engaged([target])).toBe(false);
    expect(h.waiter.engaged([{ repo: "Acme/other", pr: 1 }])).toBe(false);
    expect(h.waiter.engaged([{ repo: "elsewhere/x", pr: 1 }])).toBe(true);
    expect(h.waiter.engaged([])).toBe(false);
    await h.waiter.wait(h.request({ windowMs: 10 }));
    expect(h.notes).toEqual([
      "events: acme is not covered by this token (relay answered HTTP 403); polling it normally",
    ]);
  });

  it("does not wake twice on a redelivered event, and ignores non-matching ones", async () => {
    const h = harness([{ events: [miss("m"), hit] }, { events: [miss("m"), hit] }]);
    await h.waiter.wait(h.request({ tickStartedAt: 0 }));
    const start = h.now();
    const outcome = await h.waiter.wait(h.request({ windowMs: 40_000 }));
    expect(outcome.wake.kind).toBe("timer");
    expect(h.now() - start).toBe(40_000);
  });

  it("forgets the oldest ids past its bound", async () => {
    const flood = Array.from({ length: 2001 }, (_, index) => miss(`m${index}`));
    const h = harness([{ events: flood }, { events: [{ ...hit, id: "m0" }] }]);
    await h.waiter.wait(h.request({ windowMs: 0 }));
    const outcome = await h.waiter.wait(h.request({ windowMs: 0, tickStartedAt: 0 }));
    expect(outcome.wake.kind).toBe("event");
  });

  it("groups targets into one scope per owner, lowercased and de-duplicated", async () => {
    const h = harness([{ events: [] }]);
    await h.waiter.wait(
      h.request({
        windowMs: 1,
        targets: [
          { repo: "Acme/Widgets", pr: 1 },
          { repo: "acme/widgets", pr: 2 },
          { repo: "acme/gadgets", pr: 3 },
          { repo: "other/repo", pr: 4 },
        ],
      }),
    );
    expect(h.polls[0]!.scopes).toEqual([
      {
        owner: "acme",
        repos: ["acme/widgets", "acme/gadgets"],
        filters: [{ pr: [1, 2, 3] }],
      },
      { owner: "other", repos: ["other/repo"], filters: [{ pr: [4] }] },
    ]);
  });

  it("lets a blocking transport wait on its own and polls again until the deadline", async () => {
    const h = harness([{ events: [] }], { intervalMs: 0 });
    const start = h.now();
    const outcome = await h.waiter.wait(h.request({ windowMs: 50_000 }));
    expect(outcome.wake.kind).toBe("timer");
    expect(h.now() - start).toBe(50_000);
    expect(h.polls[0]!.waitMs).toBe(50_000);
  });

  it("notes a transport notice", async () => {
    const h = harness([{ events: [], notice: "events: hello" }]);
    await h.waiter.wait(h.request({ windowMs: 0 }));
    expect(h.notes).toEqual(["events: hello"]);
  });

  it("closes its transport", () => {
    const h = harness([{ events: [] }]);
    h.waiter.close();
    expect(h.transport.close).toHaveBeenCalled();
  });
});
