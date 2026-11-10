import { readFileSync } from "node:fs";
import { sign } from "node:crypto";
import { EXIT, ShepherdError } from "../exit-codes.mts";
import type { AuthTarget } from "./auth-target.mts";
import { githubFetch } from "./github-fetch.mts";
import type { GithubApp } from "./github-app-config.mts";
import { sanitizeBody } from "./http-utils.mts";

const BASE_URL = "https://api.github.com";
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export interface AppCredential {
  token: string;
  appId: number;
  installationId: number;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

/** Installation id per app and lowercased owner: an account has one installation of an app. */
const installations = new Map<string, number>();
const tokens = new Map<number, CachedToken>();
const inflight = new Map<string, Promise<AppCredential>>();

export function _resetAppTokens(): void {
  installations.clear();
  tokens.clear();
  inflight.clear();
}

export function hasAppTokens(): boolean {
  return tokens.size > 0;
}

/** Drop minted tokens so the next request mints fresh ones. */
export function clearAppTokens(): void {
  tokens.clear();
}

function fail(app: GithubApp, target: AuthTarget, problem: string, fix: string): never {
  throw new ShepherdError(
    `GitHub App ${app.appId} cannot authenticate for ${target.owner}/${target.repo}: ${problem}. ${fix}`,
    EXIT.NOPERM,
  );
}

const b64 = (value: string | Buffer): string => Buffer.from(value).toString("base64url");

/** RS256 JWT for the app: issued 60s ago for clock skew, valid 9 minutes. */
function signAppJwt(app: GithubApp, target: AuthTarget): string {
  const fix = `Fix private-key-file (${app.privateKeyFile}) in github-apps.yml.`;
  let pem: string;
  try {
    pem = readFileSync(app.privateKeyFile, "utf8");
  } catch (error) {
    return fail(app, target, `cannot read the private key (${(error as Error).message})`, fix);
  }
  const now = Math.floor(Date.now() / 1000);
  const payload = { iat: now - 60, exp: now + 9 * 60, iss: app.appId };
  const input = `${b64(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64(JSON.stringify(payload))}`;
  try {
    return `${input}.${b64(sign("RSA-SHA256", Buffer.from(input), pem))}`;
  } catch {
    return fail(app, target, "the private key is not a valid RSA PEM key", fix);
  }
}

async function appRequest(
  jwt: string,
  method: string,
  path: string,
): Promise<{ status: number; body: unknown; text: string }> {
  const res = await githubFetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "pr-shepherd",
    },
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {}
  return { status: res.status, body, text };
}

async function installationId(app: GithubApp, target: AuthTarget, jwt: string): Promise<number> {
  const key = `${app.appId}:${target.owner.toLowerCase()}`;
  const known = installations.get(key);
  if (known !== undefined) return known;
  const { status, body, text } = await appRequest(
    jwt,
    "GET",
    `/repos/${target.owner}/${target.repo}/installation`,
  );
  const id = (body as { id?: unknown } | undefined)?.id;
  if (status === 404) {
    return fail(app, target, "the app is not installed there", "Install the app on that account.");
  }
  if (status !== 200 || typeof id !== "number") {
    return fail(app, target, `GitHub answered ${status} ${sanitizeBody(text)}`, "Check app-id.");
  }
  installations.set(key, id);
  return id;
}

async function mint(app: GithubApp, target: AuthTarget): Promise<AppCredential> {
  const jwt = signAppJwt(app, target);
  const id = await installationId(app, target, jwt);
  const { status, body, text } = await appRequest(
    jwt,
    "POST",
    `/app/installations/${id}/access_tokens`,
  );
  const minted = body as { token?: unknown; expires_at?: unknown } | undefined;
  if (status !== 201 || typeof minted?.token !== "string") {
    return fail(app, target, `token request answered ${status} ${sanitizeBody(text)}`, "Retry.");
  }
  const expiresAt = Date.parse(String(minted.expires_at));
  tokens.set(id, { token: minted.token, expiresAt });
  return { token: minted.token, appId: app.appId, installationId: id };
}

/** Installation token for the app on the target's account, minted and refreshed in memory. */
export async function appCredential(app: GithubApp, target: AuthTarget): Promise<AppCredential> {
  const known = installations.get(`${app.appId}:${target.owner.toLowerCase()}`);
  const cached = known === undefined ? undefined : tokens.get(known);
  if (known !== undefined && cached && cached.expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return { token: cached.token, appId: app.appId, installationId: known };
  }
  const key = `${app.appId}:${target.owner.toLowerCase()}`;
  const pending = inflight.get(key) ?? mint(app, target).finally(() => inflight.delete(key));
  inflight.set(key, pending);
  return pending;
}
