import type { Dispatcher } from "undici";

/** Build the proxy agent from the request's captured environment, not a later one. */
export function createCapturedProxyAgent(
  undici: typeof import("undici"),
  httpProxy: string,
  httpsProxy: string,
): Dispatcher {
  return new undici.EnvHttpProxyAgent({
    httpProxy,
    httpsProxy,
    proxyTunnel: true,
  });
}
