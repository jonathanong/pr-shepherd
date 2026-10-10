import { createServer } from "node:http";
import { connect, type AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getGlobalDispatcher } from "undici";
import { githubWire } from "../../test-helpers/github/transport-wire.mts";
import { githubFetch } from "./github-fetch.mts";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const close of cleanup.splice(0)) await close();
});

async function proxyTo(origin: string) {
  const destination = new URL(origin);
  const tunnels: string[] = [];
  const sockets = new Set<Duplex>();
  const proxy = createServer();
  proxy.on("connect", (request, client, head) => {
    tunnels.push(request.url ?? "");
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
    await new Promise<void>((resolve, reject) =>
      proxy.close((error) => (error ? reject(error) : resolve())),
    );
  });
  return { url: `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`, tunnels };
}

function resetProxyEnvironment() {
  for (const name of [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "http_proxy",
    "https_proxy",
    "NO_PROXY",
    "no_proxy",
  ])
    vi.stubEnv(name, undefined);
}

describe("GitHub HTTP proxy routing", () => {
  it("uses the configured proxy per request and leaves the host dispatcher unchanged", async () => {
    resetProxyEnvironment();
    const origin = await githubWire((_request, response) =>
      response.end(JSON.stringify({ proxied: true })),
    );
    const proxy = await proxyTo(origin.origin);
    cleanup.push(origin.close);
    vi.stubEnv("HTTP_PROXY", proxy.url);
    const dispatcher = getGlobalDispatcher();
    const result = await githubFetch("http://github.invalid/rest");
    expect(await result.json()).toEqual({ proxied: true });
    expect(proxy.tunnels).toEqual(["github.invalid:80"]);
    expect(origin.requests[0]?.path).toBe("/rest");
    expect(getGlobalDispatcher()).toBe(dispatcher);
  });

  it("honors lowercase precedence and NO_PROXY bypass without disabling unrelated hosts", async () => {
    resetProxyEnvironment();
    const origin = await githubWire((_request, response) =>
      response.end(JSON.stringify({ received: true })),
    );
    const proxy = await proxyTo(origin.origin);
    cleanup.push(origin.close);
    vi.stubEnv("HTTP_PROXY", "http://127.0.0.1:1");
    vi.stubEnv("http_proxy", proxy.url);
    vi.stubEnv("NO_PROXY", "127.0.0.1");
    expect(await (await githubFetch(`${origin.origin}/direct`)).json()).toEqual({ received: true });
    expect(proxy.tunnels).toHaveLength(0);
    expect(await (await githubFetch("http://github.invalid/proxied")).json()).toEqual({
      received: true,
    });
    expect(proxy.tunnels).toHaveLength(1);
    expect(origin.requests.map((request) => request.path)).toEqual(["/direct", "/proxied"]);
  });

  it("routes redirects through the same proxy and supports environment changes", async () => {
    resetProxyEnvironment();
    const origin = await githubWire((request, response) => {
      if (request.path === "/redirect") {
        response.statusCode = 302;
        response.setHeader("location", "http://logs.invalid/download");
        response.end();
      } else response.end(JSON.stringify({ logs: "downloaded" }));
    });
    const first = await proxyTo(origin.origin);
    cleanup.push(origin.close);
    vi.stubEnv("HTTP_PROXY", first.url);
    expect(await (await githubFetch("http://github.invalid/redirect")).json()).toEqual({
      logs: "downloaded",
    });
    expect(first.tunnels).toEqual(expect.arrayContaining(["github.invalid:80", "logs.invalid:80"]));
    const second = await proxyTo(origin.origin);
    vi.stubEnv("HTTP_PROXY", second.url);
    expect(await (await githubFetch("http://github.invalid/next")).json()).toEqual({
      logs: "downloaded",
    });
    expect(second.tunnels).toEqual(["github.invalid:80"]);
  });
});
