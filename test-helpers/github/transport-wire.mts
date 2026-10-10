import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import type { AddressInfo } from "node:net";

// WHATWG Fetch blocked ports, matching Node's fetch implementation.
const FETCH_BLOCKED_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102,
  103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465,
  512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993,
  995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668,
  6669, 6679, 6697, 10080,
]);

export interface WireRequest {
  method: string;
  path: string;
  body: Record<string, unknown>;
  /** Non-enumerable, so whole-request equality assertions keep their shape. */
  readonly headers?: Record<string, string | string[] | undefined>;
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
    Object.defineProperty(received, "headers", { value: request.headers, enumerable: false });
    requests.push(received);
    response.setHeader("content-type", "application/json");
    reply(received, response);
  });
  const origin = `http://127.0.0.1:${await listenForFetch(server)}`;
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

async function listenForFetch(server: Server): Promise<number> {
  // Some hosts include blocked ports in their ephemeral range. Rebind only
  // those ports, preserving fetch's restrictions and the host's port range.
  for (let attempt = 0; attempt < 32; attempt++) {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    if (!FETCH_BLOCKED_PORTS.has(port)) return port;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  throw new Error("Could not allocate a fetch-compatible HTTP test port");
}
