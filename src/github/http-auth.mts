import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

let _token: string | undefined;

export function _resetTokenCache(): void {
  _token = undefined;
}

export function hasCachedToken(): boolean {
  return _token !== undefined;
}

export function clearTokenCache(): void {
  _token = undefined;
}

async function resolveToken(): Promise<string> {
  if (_token) return _token;

  const envToken = process.env["GH_TOKEN"] ?? process.env["GITHUB_TOKEN"];
  if (envToken) {
    _token = envToken;
    return _token;
  }

  try {
    const { stdout } = await execFile("gh", ["auth", "token"]);
    const token = stdout.trim();
    if (token) {
      _token = token;
      return _token;
    }
  } catch {
    // fall through to error
  }

  const codexToken = process.env["GITHUB_PERSONAL_ACCESS_TOKEN"];
  if (codexToken) {
    _token = codexToken;
    return _token;
  }

  throw new Error(
    "No GitHub token found. Set GH_TOKEN, GITHUB_TOKEN, or GITHUB_PERSONAL_ACCESS_TOKEN, or run `gh auth login`.",
  );
}

export async function makeHeaders(): Promise<Record<string, string>> {
  return {
    Authorization: `Bearer ${await resolveToken()}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "pr-shepherd",
    "Content-Type": "application/json",
  };
}
