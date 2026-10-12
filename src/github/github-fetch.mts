import type { Dispatcher } from "undici";

const currentDispatcherSlot = Symbol.for("undici.globalDispatcher.2");

let proxyAgent: Dispatcher | undefined;
let proxyConfiguration: string | undefined;
let undiciModule: Promise<typeof import("undici")> | undefined;

/**
 * Undici 8's import installs a default agent and copies it onto the legacy
 * dispatcher slot that Node 22's fetch still reads. A non-writable v2 slot
 * makes that bootstrap keep a fallback agent instead, so the legacy slot stays
 * with the host. Node 24+ already occupy the v2 slot before user code runs.
 */
function keepBundledFetchDispatcher(): void {
  if (Object.getOwnPropertyDescriptor(globalThis, currentDispatcherSlot)) return;
  Object.defineProperty(globalThis, currentDispatcherSlot, {
    value: undefined,
    writable: false,
    enumerable: false,
    configurable: false,
  });
}

function loadUndici(): Promise<typeof import("undici")> {
  undiciModule ??= (async () => {
    keepBundledFetchDispatcher();
    return import("undici");
  })();
  return undiciModule;
}

/** Attach proxy routing to GitHub requests without changing the host's dispatcher. */
export async function githubFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  const httpProxy = process.env["http_proxy"] ?? process.env["HTTP_PROXY"] ?? "";
  const httpsProxy = process.env["https_proxy"] ?? process.env["HTTPS_PROXY"] ?? "";
  if (!httpProxy && !httpsProxy) return fetch(input, init);
  const undici = await loadUndici();
  const configuration = JSON.stringify([httpProxy, httpsProxy]);
  let agent = proxyAgent;
  if (!agent || configuration !== proxyConfiguration) {
    const previous = agent;
    // Undici 8 sends plain HTTP to the proxy as an absolute-form request.
    // Tunnel every request so HTTP stays on CONNECT, matching Undici 7.
    agent = new undici.EnvHttpProxyAgent({ proxyTunnel: true });
    proxyAgent = agent;
    proxyConfiguration = configuration;
    // close waits for in-flight bodies before releasing the previous pool.
    void previous?.close().catch(() => {});
  }
  return undici.fetch(input, { ...init, dispatcher: agent });
}
