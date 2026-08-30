import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { EXIT, ShepherdError } from "../exit-codes.mts";

const execFile = promisify(execFileCb);

let _token: string | undefined;
let _tokenSource: AuthSource | undefined;

export type AuthSource =
  | "GH_TOKEN"
  | "GITHUB_TOKEN"
  | "gh auth token"
  | "GITHUB_PERSONAL_ACCESS_TOKEN";

export function _resetTokenCache(): void {
  _token = undefined;
  _tokenSource = undefined;
}

export function hasCachedToken(): boolean {
  return _token !== undefined;
}

export function clearTokenCache(): void {
  _token = undefined;
  _tokenSource = undefined;
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
 * `extra` lets callers layer additional headers (e.g. `If-None-Match` for
 * conditional REST requests) on top of the standard auth/version headers.
 */
export async function makeAuthHeaders(extra?: Record<string, string>): Promise<{
  headers: Record<string, string>;
  source: AuthSource;
}> {
  const { token, source } = await resolveToken();
  return {
    source,
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
