import { describe, expect, it, vi } from "vitest";
import { createServeTransport } from "./serve.mts";

const config = { url: "http://127.0.0.1:7391", token: "serve-token" };
const scopes = [{ owner: "acme", repos: ["acme/widgets"], filters: [] }];

function stream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  const encoder = new TextEncoder();
  return {
    response: new Response(body, { headers: { "content-type": "text/event-stream" } }),
    push: (text: string) => controller.enqueue(encoder.encode(text)),
    end: () => controller.close(),
    fail: (error: unknown) => controller.error(error),
  };
}

const frame = (id: string, cursor: string) =>
  `id: ${cursor}\nevent: envelope\ndata: ${JSON.stringify({
    id,
    event: "check_suite",
    repo: "acme/widgets",
    prs: [1],
  })}\n\n`;

describe("createServeTransport", () => {
  it("resumes from the start time and delivers streamed envelopes", async () => {
    const sse = stream();
    const fetch = vi.fn().mockResolvedValue(sse.response);
    const transport = createServeTransport(config, 1_700_000_000_000, { fetch });
    const polled = transport.poll(scopes, 5_000);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    sse.push(`: connected\n\n${frame("d1", "cur1")}`);
    const result = await polled;
    expect(result).toEqual({ events: [expect.objectContaining({ id: "d1" })] });
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe("http://127.0.0.1:7391/events");
    expect(init.headers.authorization).toBe("Bearer serve-token");
    expect(init.headers.accept).toBe("text/event-stream");
    const cursor = JSON.parse(Buffer.from(init.headers["last-event-id"], "base64url").toString());
    expect(cursor).toEqual({ v: 1, sk: "1700000000000", seen: [] });
    transport.close();
  });

  it("sends no authorization without a token and tolerates a slash in the URL", async () => {
    const sse = stream();
    const fetch = vi.fn().mockResolvedValue(sse.response);
    const transport = createServeTransport({ url: "http://127.0.0.1:7391/", token: "" }, 1, {
      fetch,
    });
    await transport.poll(scopes, 5);
    expect(fetch.mock.calls[0]![1].headers.authorization).toBeUndefined();
    expect(String(fetch.mock.calls[0]![0])).toBe("http://127.0.0.1:7391/events");
    expect(transport.intervalMs).toBe(0);
    transport.close();
  });

  it("returns empty after waitMs when nothing arrives, and on a keepalive-only chunk", async () => {
    const sse = stream();
    const transport = createServeTransport(config, 1, {
      fetch: vi.fn().mockResolvedValue(sse.response),
    });
    expect(await transport.poll(scopes, 10)).toEqual({ events: [] });
    const waiting = transport.poll(scopes, 5_000);
    sse.push(": ping\n\n");
    expect(await waiting).toEqual({ events: [] });
    transport.close();
  });

  it("returns already-buffered events without waiting", async () => {
    const sse = stream();
    const transport = createServeTransport(config, 1, {
      fetch: vi.fn().mockResolvedValue(sse.response),
    });
    await transport.poll(scopes, 5);
    sse.push(frame("d1", "c1"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((await transport.poll(scopes, 5_000)).events).toHaveLength(1);
    transport.close();
  });

  it("skips undecodable and malformed envelopes", async () => {
    const sse = stream();
    const transport = createServeTransport(config, 1, {
      fetch: vi.fn().mockResolvedValue(sse.response),
    });
    await transport.poll(scopes, 5);
    sse.push(
      `event: envelope\ndata: {oops\n\nevent: envelope\ndata: {"nope":1}\n\n${frame("ok", "c2")}`,
    );
    expect((await transport.poll(scopes, 5_000)).events.map((event) => event.id)).toEqual(["ok"]);
    transport.close();
  });

  it("reports a gap once, as unhealthy", async () => {
    const sse = stream();
    const transport = createServeTransport(config, 1, {
      fetch: vi.fn().mockResolvedValue(sse.response),
    });
    await transport.poll(scopes, 5);
    sse.push('event: gap\ndata: {"cursor":"x"}\n\n');
    expect((await transport.poll(scopes, 5_000)).unhealthy).toBe("serve reported a gap");
    expect((await transport.poll(scopes, 5)).unhealthy).toBeUndefined();
    transport.close();
  });

  it.each([401, 403])("marks every owner uncovered on HTTP %i", async (status) => {
    const fetch = vi.fn().mockResolvedValue(new Response("no", { status }));
    const result = await createServeTransport(config, 1, { fetch }).poll(
      [...scopes, { owner: "other", repos: [], filters: [] }],
      5,
    );
    expect(result.uncovered).toEqual([
      { owner: "acme", reason: `serve answered HTTP ${status}` },
      { owner: "other", reason: `serve answered HTTP ${status}` },
    ]);
  });

  it("treats other HTTP errors, a missing body, and connection failures as unhealthy", async () => {
    const poll = (fetch: (input: string | URL) => Promise<Response>) =>
      createServeTransport(config, 1, { fetch }).poll(scopes, 5);
    expect(
      (await poll(vi.fn().mockResolvedValue(new Response("x", { status: 503 })))).unhealthy,
    ).toBe("serve answered HTTP 503");
    expect((await poll(vi.fn().mockResolvedValue(new Response(null)))).unhealthy).toBe(
      "serve answered HTTP 200",
    );
    expect((await poll(vi.fn().mockRejectedValue(new TypeError("fetch failed")))).unhealthy).toBe(
      "serve connection failed (TypeError)",
    );
    expect((await poll(vi.fn().mockRejectedValue("boom"))).unhealthy).toBe(
      "serve connection failed (error)",
    );
  });

  it("reports a closed stream, then reconnects from the last id", async () => {
    const first = stream();
    const second = stream();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(first.response)
      .mockResolvedValueOnce(second.response);
    const transport = createServeTransport(config, 1, { fetch });
    await transport.poll(scopes, 5);
    first.push(frame("d1", "resume-here"));
    expect((await transport.poll(scopes, 5_000)).events).toHaveLength(1);
    const closing = transport.poll(scopes, 5_000);
    first.end();
    expect((await closing).unhealthy).toBe("serve closed the stream");
    const healing = transport.poll(scopes, 5_000);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 5));
    second.push(frame("d2", "next"));
    const healed = await healing;
    expect(healed.events.map((event) => event.id)).toEqual(["d2"]);
    expect(healed.unhealthy).toBeUndefined();
    expect(fetch.mock.calls[1]![1].headers["last-event-id"]).toBe("resume-here");
    transport.close();
  });

  it("reports a stream error by name, or generically for a non-Error", async () => {
    for (const [error, label] of [
      [new RangeError("x"), "serve stream failed (RangeError)"],
      ["boom", "serve stream failed (error)"],
    ] as const) {
      const sse = stream();
      const transport = createServeTransport(config, 1, {
        fetch: vi.fn().mockResolvedValue(sse.response),
      });
      await transport.poll(scopes, 5);
      sse.fail(error);
      expect((await transport.poll(scopes, 5_000)).unhealthy).toBe(label);
      transport.close();
    }
  });

  it("ignores a stream it already replaced or closed", async () => {
    const stale = stream();
    const fresh = stream();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(stale.response)
      .mockResolvedValueOnce(fresh.response);
    const transport = createServeTransport(config, 1, { fetch });
    await transport.poll(scopes, 5);
    transport.close();
    stale.push(frame("late", "l1"));
    await new Promise((resolve) => setTimeout(resolve, 10));
    const result = await transport.poll(scopes, 5);
    expect(result).toEqual({ events: [] });
    transport.close();
    fresh.end();
  });
});
