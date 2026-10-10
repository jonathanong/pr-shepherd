import { EnvHttpProxyAgent } from "undici";

let proxyAgent: EnvHttpProxyAgent | undefined;
let proxyConfiguration: string | undefined;

/** Attach proxy routing to GitHub requests without changing the host's dispatcher. */
export function githubFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  const httpProxy = process.env["http_proxy"] ?? process.env["HTTP_PROXY"] ?? "";
  const httpsProxy = process.env["https_proxy"] ?? process.env["HTTPS_PROXY"] ?? "";
  if (!httpProxy && !httpsProxy) return fetch(input, init);
  const configuration = JSON.stringify([httpProxy, httpsProxy]);
  if (!proxyAgent || configuration !== proxyConfiguration) {
    const previous = proxyAgent;
    proxyAgent = new EnvHttpProxyAgent();
    proxyConfiguration = configuration;
    // close waits for in-flight bodies before releasing the previous pool.
    void previous?.close().catch(() => {});
  }
  return fetch(input, { ...init, dispatcher: proxyAgent } as RequestInit);
}
