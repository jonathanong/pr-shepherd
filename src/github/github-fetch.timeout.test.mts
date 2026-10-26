import { createServer } from "node:http";
import { connect, type AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { githubWire } from "../../test-helpers/github/transport-wire.mts";
import { githubFetch } from "./github-fetch.mts";
import { isTransportError } from "./http-utils.mts";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const close of cleanup.splice(0)) await close();
});

function hangingOrigin() {
  return githubWire(() => {});
}

async function tunnelProxy(origin: string) {
  const destination = new URL(origin);
  const sockets = new Set<Duplex>();
  const proxy = createServer();
  proxy.on("connect", (_request, client, head) => {
    const upstream = connect(Number(destination.port), destination.hostname, () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      upstream.write(head);
      client.pipe(upstream);
      upstream.pipe(client);
    });
    sockets.add(upstream);
    sockets.add(client);
    upstream.on("error", () => client.destroy());
    client.on("error", () => upstream.destroy());
  });
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  cleanup.push(async () => {
    for (const socket of sockets) socket.destroy();
    proxy.closeAllConnections();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
  });
  return `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
}

describe("githubFetch request deadline", () => {
  it("fails a request whose headers never arrive as a transient timeout", async () => {
    const origin = await hangingOrigin();
    cleanup.push(origin.close);
    const error = await githubFetch(`${origin.origin}/hung?token=secret`, { method: "POST" }, 50)
      .then(() => undefined)
      .catch((err: unknown) => err);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      `GitHub request timed out after 0.05s: POST ${origin.origin}/hung`,
    );
    expect((error as NodeJS.ErrnoException).code).toBe("ETIMEDOUT");
    expect(isTransportError(error)).toBe(true);
  });

  it("applies the same deadline through the proxy agent", async () => {
    const origin = await hangingOrigin();
    cleanup.push(origin.close);
    vi.stubEnv("HTTP_PROXY", await tunnelProxy(origin.origin));
    vi.stubEnv("NO_PROXY", undefined);
    const error = await githubFetch("http://github.invalid/hung", undefined, 50)
      .then(() => undefined)
      .catch((err: unknown) => err);
    expect((error as Error).message).toContain("GitHub request timed out after 0.05s: GET");
    expect(isTransportError(error)).toBe(true);
  });

  it("bounds a body that stalls after the headers inside the same call", async () => {
    const origin = await githubWire((_request, response) => {
      response.write("{");
    });
    cleanup.push(origin.close);
    const error = await githubFetch(`${origin.origin}/slow-body`, undefined, 100).then(
      () => undefined,
      (err: unknown) => err,
    );
    expect((error as NodeJS.ErrnoException).code).toBe("ETIMEDOUT");
    expect(isTransportError(error)).toBe(true);
  });

  it("returns an empty-bodied response as a fresh response", async () => {
    const origin = await githubWire((_request, response) => {
      response.statusCode = 204;
      response.end();
    });
    cleanup.push(origin.close);
    const response = await githubFetch(`${origin.origin}/empty`);
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  it("keeps the caller's abort distinct from the deadline", async () => {
    const origin = await hangingOrigin();
    cleanup.push(origin.close);
    const controller = new AbortController();
    const pending = githubFetch(`${origin.origin}/hung`, { signal: controller.signal }, 5000);
    controller.abort(new Error("caller gave up"));
    await expect(pending).rejects.toThrow("caller gave up");
  });

  it("returns responses that arrive inside the deadline", async () => {
    const origin = await githubWire((_request, response) => response.end('{"ok":true}'));
    cleanup.push(origin.close);
    const response = await githubFetch(`${origin.origin}/fast`, {
      signal: new AbortController().signal,
    });
    expect(await response.json()).toEqual({ ok: true });
  });
});
