import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { EXIT, ShepherdError } from "../exit-codes.mts";
import type { EventsSourceConfig } from "./types.mts";

const SETUP_HINT =
  "run `npx -y hook-harness@0.3.3 token create --repos 'owner/*' --label pr-shepherd --login`, " +
  "or set HOOK_HARNESS_URL and HOOK_HARNESS_TOKEN, or set HOOK_HARNESS_SOURCE to a " +
  "`hook-harness serve` URL";

/** Where hook-harness keeps `client.json`: the same resolution its own CLI uses. */
function hookHarnessConfigDir(env: NodeJS.ProcessEnv): string {
  if (env["HOOK_HARNESS_CONFIG_DIR"]) return env["HOOK_HARNESS_CONFIG_DIR"];
  return join(env["XDG_CONFIG_HOME"] || join(homedir(), ".config"), "hook-harness");
}

function readSaved(env: NodeJS.ProcessEnv): { url?: string; token?: string } {
  try {
    const saved: unknown = JSON.parse(
      readFileSync(join(hookHarnessConfigDir(env), "client.json"), "utf8"),
    );
    if (saved === null || typeof saved !== "object") return {};
    const { url, token } = saved as Record<string, unknown>;
    return {
      ...(typeof url === "string" && { url }),
      ...(typeof token === "string" && { token }),
    };
  } catch {
    return {};
  }
}

function checkedUrl(url: string, origin: string): string {
  let protocol: string | undefined;
  try {
    protocol = new URL(url).protocol;
  } catch {
    protocol = undefined;
  }
  if (protocol !== "http:" && protocol !== "https:") {
    throw new ShepherdError(
      `events.source is hook-harness but ${origin} is not an http(s) URL.`,
      EXIT.CONFIG,
    );
  }
  return url;
}

/**
 * Resolve the hook-harness source with its own precedence: `HOOK_HARNESS_SOURCE` (a local
 * `serve`) wins, then `HOOK_HARNESS_URL` + `HOOK_HARNESS_TOKEN`, then `client.json`. Throws a
 * config error when none resolves. The token is returned to callers but never logged here.
 */
export function resolveEventsSource(env: NodeJS.ProcessEnv = process.env): EventsSourceConfig {
  const source = env["HOOK_HARNESS_SOURCE"];
  if (source) {
    return {
      kind: "serve",
      url: checkedUrl(source, "HOOK_HARNESS_SOURCE"),
      token: env["HOOK_HARNESS_SOURCE_TOKEN"] ?? "",
    };
  }
  const saved = readSaved(env);
  const url = env["HOOK_HARNESS_URL"] || saved.url;
  const token = env["HOOK_HARNESS_TOKEN"] || saved.token;
  if (!url || !token) {
    throw new ShepherdError(
      `events.source is hook-harness but no hook-harness login was found: ${SETUP_HINT}.`,
      EXIT.CONFIG,
    );
  }
  return { kind: "relay", url: checkedUrl(url, "the hook-harness relay URL"), token };
}
