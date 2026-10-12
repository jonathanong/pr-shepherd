import type { Dispatcher } from "undici";

const legacyDispatcherSlot = Symbol.for("undici.globalDispatcher.1");

let proxyAgent: Dispatcher | undefined;
let proxyConfiguration: string | undefined;
let undiciModule: Promise<typeof import("undici")> | undefined;

/**
 * Undici 8's import installs a default agent and copies it onto the legacy
 * dispatcher slot that Node 22 and 24's fetch still reads. Put the host's
 * value back afterwards. The current slot stays writable, so a later
 * setGlobalDispatcher() can replace it and mirror that change onto fetch.
 */
function restoreLegacyDispatcher(previous: PropertyDescriptor | undefined): void {
  if (previous) {
    Object.defineProperty(globalThis, legacyDispatcherSlot, previous);
    return;
  }
  const installed = Object.getOwnPropertyDescriptor(globalThis, legacyDispatcherSlot);
  // Undici defines this property as non-configurable, so absence can only be
  // represented by clearing the value.
  if (!installed?.writable) return;
  Object.defineProperty(globalThis, legacyDispatcherSlot, {
    value: undefined,
    writable: true,
    enumerable: false,
    configurable: false,
  });
}

function loadUndici(): Promise<typeof import("undici")> {
  undiciModule ??= (async () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, legacyDispatcherSlot);
    try {
      return await import("undici");
    } finally {
      restoreLegacyDispatcher(previous);
    }
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
