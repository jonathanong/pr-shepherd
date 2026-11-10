import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, vi } from "vitest";
import { _resetTokenCache } from "../../src/github/http-auth.mts";

export const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

export const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

export interface Call {
  url: string;
  method: string;
  auth: string;
}

/** Mutable per-test state shared with the test file. */
export const state = { home: "", calls: [] as Call[], expiresAt: "", mintCount: 0 };

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Routes the app endpoints; `overrides` is keyed `METHOD /path`. */
export function route(overrides: Record<string, () => Response> = {}): void {
  fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
    const method = init.method ?? "GET";
    const auth = (init.headers as Record<string, string>)["Authorization"] ?? "";
    state.calls.push({ url, method, auth });
    const key = `${method} ${new URL(url).pathname}`;
    const override = overrides[key];
    if (override) return override();
    if (key.endsWith("/installation")) return json(200, { id: 7 });
    if (key === "POST /app/installations/7/access_tokens") {
      state.mintCount += 1;
      return json(201, { token: `inst-token-${state.mintCount}`, expires_at: state.expiresAt });
    }
    return json(200, { data: { ok: true } });
  });
}

export const apiCalls = (): Call[] =>
  state.calls.filter((call) => !call.url.includes("/app/") && !call.url.endsWith("/installation"));

/** App 42 covers `Acme/*` and `other/one`; the user token is `user-token`. */
export function registerAppAuthHooks(): void {
  const previousHome = process.env["PR_SHEPHERD_HOME"];
  const previousGh = process.env["GH_TOKEN"];
  beforeEach(() => {
    state.home = mkdtempSync(join(tmpdir(), "app-auth-"));
    process.env["PR_SHEPHERD_HOME"] = state.home;
    process.env["GH_TOKEN"] = "user-token";
    state.calls = [];
    state.mintCount = 0;
    state.expiresAt = new Date(Date.now() + 3600_000).toISOString();
    fetchMock.mockReset();
    _resetTokenCache();
    writeFileSync(join(state.home, "app.pem"), pem);
    writeFileSync(
      join(state.home, "github-apps.yml"),
      "apps:\n  - app-id: 42\n    private-key-file: app.pem\n    repositories: [Acme/*, other/one]\n",
    );
    route();
  });
  afterEach(() => {
    rmSync(state.home, { recursive: true, force: true });
    process.env["PR_SHEPHERD_HOME"] = previousHome;
    if (previousGh === undefined) delete process.env["GH_TOKEN"];
    else process.env["GH_TOKEN"] = previousGh;
    _resetTokenCache();
  });
}
