import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { resolveEventsSource } from "./config.mts";

function configDirWith(client: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "hh-config-"));
  mkdirSync(join(dir, "hook-harness"));
  const text = typeof client === "string" ? client : JSON.stringify(client);
  writeFileSync(join(dir, "hook-harness", "client.json"), text);
  return dir;
}

describe("config directory resolution", () => {
  const client = JSON.stringify({ url: "https://saved.example", token: "saved" });
  const saved = { kind: "relay", url: "https://saved.example", token: "saved" };

  it("prefers HOOK_HARNESS_CONFIG_DIR", () => {
    const dir = mkdtempSync(join(tmpdir(), "hh-direct-"));
    writeFileSync(join(dir, "client.json"), client);
    expect(
      resolveEventsSource({ HOOK_HARNESS_CONFIG_DIR: dir, XDG_CONFIG_HOME: "/nonexistent" }),
    ).toEqual(saved);
  });

  it("falls back to ~/.config/hook-harness", () => {
    const home = mkdtempSync(join(tmpdir(), "hh-home-"));
    mkdirSync(join(home, ".config", "hook-harness"), { recursive: true });
    writeFileSync(join(home, ".config", "hook-harness", "client.json"), client);
    vi.stubEnv("HOME", home);
    try {
      expect(resolveEventsSource({})).toEqual(saved);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("resolveEventsSource", () => {
  it("uses HOOK_HARNESS_SOURCE as a serve source, with its optional token", () => {
    expect(resolveEventsSource({ HOOK_HARNESS_SOURCE: "http://127.0.0.1:7391" })).toEqual({
      kind: "serve",
      url: "http://127.0.0.1:7391",
      token: "",
    });
    expect(
      resolveEventsSource({
        HOOK_HARNESS_SOURCE: "http://127.0.0.1:7391",
        HOOK_HARNESS_SOURCE_TOKEN: "s3",
        HOOK_HARNESS_URL: "https://relay.example",
        HOOK_HARNESS_TOKEN: "ignored",
      }),
    ).toEqual({ kind: "serve", url: "http://127.0.0.1:7391", token: "s3" });
  });

  it("refuses to send a token over plain http to a non-loopback host", () => {
    const relay = (url: string) => () =>
      resolveEventsSource({
        HOOK_HARNESS_URL: url,
        HOOK_HARNESS_TOKEN: "hh_x",
        HOOK_HARNESS_CONFIG_DIR: "/nonexistent-hh-dir",
      });
    expect(relay("http://relay.example")).toThrow("plain http to a non-loopback host");
    expect(relay("http://localhost:9000")().url).toBe("http://localhost:9000");
    expect(relay("http://[::1]:9000")().url).toBe("http://[::1]:9000");
    expect(() =>
      resolveEventsSource({
        HOOK_HARNESS_SOURCE: "http://box.lan:7391",
        HOOK_HARNESS_SOURCE_TOKEN: "s",
      }),
    ).toThrow("plain http to a non-loopback host");
    expect(resolveEventsSource({ HOOK_HARNESS_SOURCE: "http://box.lan:7391" }).token).toBe("");
  });

  it("uses the relay URL and token from the environment", () => {
    expect(
      resolveEventsSource({
        HOOK_HARNESS_URL: "https://relay.example",
        HOOK_HARNESS_TOKEN: "hh_x",
        HOOK_HARNESS_CONFIG_DIR: "/nonexistent-hh-dir",
      }),
    ).toEqual({ kind: "relay", url: "https://relay.example", token: "hh_x" });
  });

  it("reads client.json, with env vars overriding each field", () => {
    const dir = configDirWith({ url: "https://saved.example", token: "saved" });
    expect(resolveEventsSource({ XDG_CONFIG_HOME: dir })).toEqual({
      kind: "relay",
      url: "https://saved.example",
      token: "saved",
    });
    expect(resolveEventsSource({ XDG_CONFIG_HOME: dir, HOOK_HARNESS_TOKEN: "env" })).toEqual({
      kind: "relay",
      url: "https://saved.example",
      token: "env",
    });
  });

  it("ignores an unreadable, malformed, or non-object client.json", () => {
    const env = { HOOK_HARNESS_URL: "https://r.example", HOOK_HARNESS_TOKEN: "t" };
    for (const text of ["{not json", "null", '{"url": 1, "token": 2}']) {
      expect(resolveEventsSource({ ...env, XDG_CONFIG_HOME: configDirWith(text) })).toMatchObject({
        url: "https://r.example",
        token: "t",
      });
    }
  });

  it("fails with setup guidance when nothing resolves, never naming a token value", () => {
    const run = () => resolveEventsSource({ HOOK_HARNESS_CONFIG_DIR: "/nonexistent-hh-dir" });
    expect(run).toThrow(/token create .*--login/);
    expect(run).toThrow(/HOOK_HARNESS_URL and HOOK_HARNESS_TOKEN/);
    expect(run).toThrow(/HOOK_HARNESS_SOURCE/);
    try {
      run();
    } catch (error) {
      expect(error).toMatchObject({ exitCode: 78 });
    }
    expect(() =>
      resolveEventsSource({ HOOK_HARNESS_URL: "https://r.example", HOOK_HARNESS_CONFIG_DIR: "/x" }),
    ).toThrow(/no hook-harness login/);
  });

  it("rejects non-http(s) URLs", () => {
    expect(() => resolveEventsSource({ HOOK_HARNESS_SOURCE: "ftp://x" })).toThrow(
      /HOOK_HARNESS_SOURCE is not an http\(s\) URL/,
    );
    expect(() => resolveEventsSource({ HOOK_HARNESS_SOURCE: "nope" })).toThrow(/http\(s\)/);
    expect(() =>
      resolveEventsSource({ HOOK_HARNESS_URL: "file:///x", HOOK_HARNESS_TOKEN: "t" }),
    ).toThrow(/relay URL is not an http\(s\) URL/);
  });
});
