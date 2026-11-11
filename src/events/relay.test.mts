import { describe, expect, it, vi } from "vitest";
import { createRelayTransport } from "./relay.mts";

const config = { url: "https://relay.example/prod", token: "hh_secret" };
const scope = { owner: "acme", repos: ["acme/widgets"], filters: [] as never[] };

const envelope = (id: string) => ({ id, event: "check_suite", repo: "acme/widgets", prs: [1] });
const page = (body: object, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("createRelayTransport", () => {
  it("asks the relay for one owner, echoing cursors exactly and starting at epoch ms", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(page({ events: [envelope("a")], cursor: "000123#a" }))
      .mockResolvedValueOnce(page({ events: [], cursor: "000124#b!" }));
    const transport = createRelayTransport(config, 1_700_000_000_000, { fetch });
    const first = await transport.poll([scope], 0);
    expect(first).toEqual({
      events: [expect.objectContaining({ id: "a", event: "check_suite" })],
    });
    await transport.poll([scope], 0);
    const urls = fetch.mock.calls.map(([url]) => new URL(String(url)));
    expect(urls[0]?.pathname).toBe("/prod/events");
    expect(Object.fromEntries(urls[0]!.searchParams)).toEqual({
      owner: "acme",
      repos: "acme/widgets",
      after: "1700000000000",
      limit: "100",
      payload: "0",
    });
    expect(urls[1]?.searchParams.get("after")).toBe("000123#a");
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      headers: { authorization: "Bearer hh_secret" },
    });
  });

  it("omits repos for a scope without any, and tolerates a trailing slash", async () => {
    const fetch = vi.fn().mockResolvedValue(page({ events: [], cursor: "c" }));
    const transport = createRelayTransport({ ...config, url: "https://relay.example/" }, 1, {
      fetch,
    });
    await transport.poll([{ owner: "acme", repos: [], filters: [] }], 0);
    const url = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/events");
    expect(url.searchParams.has("repos")).toBe(false);
  });

  it("repolls immediately while the relay says more", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(page({ events: [envelope("a")], cursor: "c1", more: true }))
      .mockResolvedValueOnce(page({ events: [envelope("b")], cursor: "c2" }));
    const result = await createRelayTransport(config, 1, { fetch }).poll([scope], 0);
    expect(result.events.map((event) => event.id)).toEqual(["a", "b"]);
    expect(new URL(String(fetch.mock.calls[1]?.[0])).searchParams.get("after")).toBe("c1");
  });

  it("bounds a relay that always says more", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async () => page({ events: [], cursor: "c", more: true }));
    await createRelayTransport(config, 1, { fetch }).poll([scope], 0);
    expect(fetch).toHaveBeenCalledTimes(20);
  });

  it("queries each owner separately and marks an owner the token cannot read uncovered", async () => {
    const fetch = vi.fn().mockImplementation(async (url: URL) => {
      return url.searchParams.get("owner") === "other"
        ? page({ error: "forbidden" }, 403)
        : page({ events: [envelope("a")], cursor: "c" });
    });
    const result = await createRelayTransport(config, 1, { fetch }).poll(
      [scope, { owner: "other", repos: ["other/r"], filters: [] }],
      0,
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.events).toHaveLength(1);
    expect(result.uncovered).toEqual([{ owner: "other", reason: "relay answered HTTP 403" }]);
    expect(result.unhealthy).toBeUndefined();
  });

  it("treats 401 as uncovered", async () => {
    const fetch = vi.fn().mockResolvedValue(page({}, 401));
    const result = await createRelayTransport(config, 1, { fetch }).poll([scope], 0);
    expect(result.uncovered).toEqual([{ owner: "acme", reason: "relay answered HTTP 401" }]);
  });

  it.each([500, 413])("treats HTTP %i as unhealthy and keeps the cursor", async (status) => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(page({}, status))
      .mockResolvedValueOnce(page({ events: [], cursor: "c" }));
    const transport = createRelayTransport(config, 42, { fetch });
    expect((await transport.poll([scope], 0)).unhealthy).toBe(`relay answered HTTP ${status}`);
    await transport.poll([scope], 0);
    expect(new URL(String(fetch.mock.calls[1]?.[0])).searchParams.get("after")).toBe("42");
  });

  it("treats a network error as unhealthy without leaking its message", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed: hh_secret"));
    const result = await createRelayTransport(config, 1, { fetch }).poll([scope], 0);
    expect(result.unhealthy).toBe("relay request failed (TypeError)");
    const nonError = vi.fn().mockRejectedValue("boom");
    expect(
      (await createRelayTransport(config, 1, { fetch: nonError }).poll([scope], 0)).unhealthy,
    ).toBe("relay request failed (error)");
  });

  it.each([null, {}, { events: [], cursor: 5 }, { events: "x", cursor: "c" }])(
    "treats a malformed page %j as unhealthy",
    async (body) => {
      const fetch = vi.fn().mockResolvedValue(page(body as object));
      const result = await createRelayTransport(config, 1, { fetch }).poll([scope], 0);
      expect(result.unhealthy).toBe("relay returned a malformed page");
    },
  );

  it("keeps events from earlier pages when a later page fails", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(page({ events: [envelope("a")], cursor: "c1", more: true }))
      .mockResolvedValueOnce(page({}, 502));
    const result = await createRelayTransport(config, 1, { fetch }).poll([scope], 0);
    expect(result.events).toHaveLength(1);
    expect(result.unhealthy).toBe("relay answered HTTP 502");
  });

  it("reports a gap as unhealthy but still advances the cursor and returns events", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(page({ events: [envelope("a")], cursor: "c9", gap: true }))
      .mockResolvedValueOnce(page({ events: [], cursor: "c10" }));
    const transport = createRelayTransport(config, 1, { fetch });
    const result = await transport.poll([scope], 0);
    expect(result.unhealthy).toMatch(/gap/);
    expect(result.events).toHaveLength(1);
    await transport.poll([scope], 0);
    expect(new URL(String(fetch.mock.calls[1]?.[0])).searchParams.get("after")).toBe("c9");
  });

  it("sends filters as a bandwidth hint", async () => {
    const fetch = vi.fn().mockResolvedValue(page({ events: [], cursor: "c" }));
    const filters = [{ pr: [7] }, { sha: ["abc"] }];
    await createRelayTransport(config, 1, { fetch }).poll([{ ...scope, filters }], 0);
    const url = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(JSON.parse(url.searchParams.get("filters")!)).toEqual(filters);
  });

  it("drops filters over the size limit", async () => {
    const fetch = vi.fn().mockResolvedValue(page({ events: [], cursor: "c" }));
    const filters = [{ ref: ["x".repeat(5000)] }];
    await createRelayTransport(config, 1, { fetch }).poll([{ ...scope, filters }], 0);
    expect(new URL(String(fetch.mock.calls[0]?.[0])).searchParams.has("filters")).toBe(false);
  });

  it("retries without filters after a 400 and says so once", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(page({ error: "invalid filters" }, 400))
      .mockResolvedValue(page({ events: [envelope("a")], cursor: "c" }));
    const transport = createRelayTransport(config, 1, { fetch });
    const filters = [{ pr: [7] }];
    const first = await transport.poll([{ ...scope, filters }], 0);
    expect(first.events).toHaveLength(1);
    expect(first.unhealthy).toBeUndefined();
    expect(first.notice).toMatch(/rejected `filters`/);
    const second = await transport.poll([{ ...scope, filters }], 0);
    expect(second.notice).toBeUndefined();
    expect(new URL(String(fetch.mock.calls[2]?.[0])).searchParams.has("filters")).toBe(false);
  });

  it("treats a 400 without filters as unhealthy", async () => {
    const fetch = vi.fn().mockResolvedValue(page({}, 400));
    expect((await createRelayTransport(config, 1, { fetch }).poll([scope], 0)).unhealthy).toBe(
      "relay answered HTTP 400",
    );
  });

  it("closes as a no-op and polls on a 15 second cadence", () => {
    const transport = createRelayTransport(config, 1, { fetch: vi.fn() });
    expect(transport.intervalMs).toBe(15_000);
    expect(() => transport.close()).not.toThrow();
  });
});
