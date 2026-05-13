// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerHooks, getStdout } from "./cli-parser.test-support.mts";
import { readFileSync } from "node:fs";
import { main } from "./cli-parser.mts";

registerHooks();

describe("main — --version", () => {
  const pkgVersion = (
    JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      version: string;
    }
  ).version;

  it("prints the exact package.json version followed by a newline for --version", async () => {
    await main(["node", "shepherd", "--version"]);
    expect(getStdout()).toBe(`${pkgVersion}\n`);
    expect(process.exitCode).toBeUndefined();
  });

  it("also accepts -v with identical output", async () => {
    await main(["node", "shepherd", "-v"]);
    expect(getStdout()).toBe(`${pkgVersion}\n`);
    expect(process.exitCode).toBeUndefined();
  });
});
