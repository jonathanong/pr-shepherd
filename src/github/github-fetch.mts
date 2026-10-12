import { createRequire } from "node:module";
import type { Dispatcher } from "undici";
import { createCapturedProxyAgent } from "./captured-proxy-agent.mts";
import { loadUndiciKeepingLegacyDispatcher } from "./legacy-dispatcher.mts";

const require = createRequire(import.meta.url);

let proxyAgent: Dispatcher | undefined;
let proxyConfiguration: string | undefined;
let undiciModule: typeof import("undici") | undefined;

function loadUndici(): typeof import("undici") {
  undiciModule ??= loadUndiciKeepingLegacyDispatcher(
    () => require("undici") as typeof import("undici"),
  );
  return undiciModule;
}

/** Attach proxy routing to GitHub requests without changing the host's dispatcher. */
export async function githubFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  const httpProxy = process.env["http_proxy"] ?? process.env["HTTP_PROXY"] ?? "";
  const httpsProxy = process.env["https_proxy"] ?? process.env["HTTPS_PROXY"] ?? "";
  if (!httpProxy && !httpsProxy) return fetch(input, init);
  const undici = loadUndici();
  const configuration = JSON.stringify([httpProxy, httpsProxy]);
  let agent = proxyAgent;
  if (!agent || configuration !== proxyConfiguration) {
    const previous = agent;
    // Undici 8 sends plain HTTP to the proxy as an absolute-form request.
    // Tunnel every request so HTTP stays on CONNECT, matching Undici 7.
    agent = createCapturedProxyAgent(undici, httpProxy, httpsProxy);
    proxyAgent = agent;
    proxyConfiguration = configuration;
    // close waits for in-flight bodies before releasing the previous pool.
    void previous?.close().catch(() => {});
  }
  return undici.fetch(input, { ...init, dispatcher: agent });
}
