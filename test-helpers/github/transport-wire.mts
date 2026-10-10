import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface WireRequest {
  method: string;
  path: string;
  body: Record<string, unknown>;
}

/** Real HTTP requests; only GitHub's origin is redirected to a local test server. */
export async function githubWire(reply: (request: WireRequest, response: ServerResponse) => void) {
  const requests: WireRequest[] = [];
  const server = createServer(async (request: IncomingMessage, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString();
    const received = {
      method: request.method ?? "GET",
      path: request.url ?? "/",
      body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {},
    };
    requests.push(received);
    response.setHeader("content-type", "application/json");
    reply(received, response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const nativeFetch = globalThis.fetch;
  return {
    origin,
    requests,
    fetch(input: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      const destination =
        url.hostname === "api.github.com" ? `${origin}${url.pathname}${url.search}` : url.href;
      return nativeFetch(destination, init);
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
