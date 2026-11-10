import { createHash } from "node:crypto";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { EXIT, ShepherdError } from "../exit-codes.mts";
import { currentAuthTarget, type AuthTarget } from "./auth-target.mts";
import { _resetGithubApps, findGithubApp } from "./github-app-config.mts";
import {
  _resetAppTokens,
  appCredential,
  clearAppTokens,
  hasAppTokens,
} from "./github-app-token.mts";

const execFile = promisify(execFileCb);

let _token: string | undefined;
let _tokenSource: AuthSource | undefined;

export type AuthSource =
  | "GH_TOKEN"
  | "GITHUB_TOKEN"
  | "gh auth token"
  | "GITHUB_PERSONAL_ACCESS_TOKEN"
  | `GitHub App ${number} (installation ${number})`;

export function _resetTokenCache(): void {
  _token = undefined;
  _tokenSource = undefined;
  _resetGithubApps();
  _resetAppTokens();
}

export function hasCachedToken(): boolean {
  return _token !== undefined || hasAppTokens();
}

/** Forget the user token and every minted installation token; the next request re-resolves. */
export function clearTokenCache(): void {
  _token = undefined;
  _tokenSource = undefined;
  clearAppTokens();
}

/** Truncated SHA-256. Callers persist this instead of the token or its full hash. */
export function credentialFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

async function resolveToken(): Promise<{ token: string; source: AuthSource }> {
  if (_token && _tokenSource) return { token: _token, source: _tokenSource };

  const ghToken = process.env["GH_TOKEN"];
  if (ghToken) {
    _token = ghToken;
    _tokenSource = "GH_TOKEN";
    return { token: _token, source: _tokenSource };
  }
  const githubToken = process.env["GITHUB_TOKEN"];
  if (githubToken) {
    _token = githubToken;
    _tokenSource = "GITHUB_TOKEN";
    return { token: _token, source: _tokenSource };
  }

  try {
    const { stdout } = await execFile("gh", ["auth", "token"]);
    const token = stdout.trim();
    if (token) {
      _token = token;
      _tokenSource = "gh auth token";
      return { token: _token, source: _tokenSource };
    }
  } catch {
    // fall through to error
  }

  const codexToken = process.env["GITHUB_PERSONAL_ACCESS_TOKEN"];
  if (codexToken) {
    _token = codexToken;
    _tokenSource = "GITHUB_PERSONAL_ACCESS_TOKEN";
    return { token: _token, source: _tokenSource };
  }

  throw new ShepherdError(
    "No GitHub token found. Set GH_TOKEN, GITHUB_TOKEN, or GITHUB_PERSONAL_ACCESS_TOKEN, or run `gh auth login`.",
    EXIT.NOPERM,
  );
}

/**
 * A configured GitHub App that covers the target repository wins over every user token. Its
 * fingerprint is a stable identity, because installation tokens rotate hourly.
 */
async function resolveCredential(
  target: AuthTarget | undefined,
): Promise<{ token: string; source: AuthSource; fingerprint: string }> {
  const app = target && findGithubApp(target.owner, target.repo);
  if (app) {
    const { token, appId, installationId } = await appCredential(app, target);
    return {
      token,
      source: `GitHub App ${appId} (installation ${installationId})`,
      fingerprint: credentialFingerprint(`github-app:${appId}:${installationId}`),
    };
  }
  const { token, source } = await resolveToken();
  return { token, source, fingerprint: credentialFingerprint(token) };
}

/**
 * `extra` lets callers layer additional headers (e.g. `If-None-Match` for
 * conditional REST requests) on top of the standard auth/version headers. `target` is the
 * request's own repository; without one the command's auth scope decides.
 */
export async function makeAuthHeaders(
  extra?: Record<string, string>,
  target?: AuthTarget,
): Promise<{
  headers: Record<string, string>;
  source: AuthSource;
  fingerprint: string;
}> {
  const { token, source, fingerprint } = await resolveCredential(target ?? currentAuthTarget());
  return {
    source,
    fingerprint,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "pr-shepherd",
      "Content-Type": "application/json",
      ...extra,
    },
  };
}
