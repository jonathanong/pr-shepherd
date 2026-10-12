import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

async function runFreshProcess(script: string): Promise<void> {
  const env = { ...process.env };
  for (const name of [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "http_proxy",
    "https_proxy",
    "NO_PROXY",
    "no_proxy",
  ])
    delete env[name];
  await execFileAsync(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "-e", script],
    { cwd: repoRoot, env },
  );
}

describe("Undici dispatcher slot", () => {
  it("keeps the host legacy dispatcher and still lets setGlobalDispatcher replace it", async () => {
    await runFreshProcess(`
      const legacy = Symbol.for("undici.globalDispatcher.1");
      const current = Symbol.for("undici.globalDispatcher.2");
      const host = { dispatch() { return true; } };
      Object.defineProperty(globalThis, legacy, {
        value: host,
        writable: true,
        enumerable: false,
        configurable: false,
      });
      process.env.HTTP_PROXY = "http://127.0.0.1:9";
      const { githubFetch } = await import("./src/github/github-fetch.mts");
      const controller = new AbortController();
      controller.abort();
      await githubFetch("http://example.invalid/", { signal: controller.signal }).catch((error) => {
        if (error?.name !== "AbortError") throw error;
      });
      if (globalThis[legacy] !== host) throw new Error("legacy dispatcher was replaced");
      const { Agent, setGlobalDispatcher, getGlobalDispatcher } = await import("undici");
      const agent = new Agent();
      setGlobalDispatcher(agent);
      if (globalThis[current] !== agent) throw new Error("current dispatcher slot was not replaced");
      if (globalThis[legacy] === host || globalThis[legacy] == null) {
        throw new Error("legacy dispatcher was not mirrored");
      }
      if (getGlobalDispatcher() !== agent) throw new Error("getGlobalDispatcher missed the replacement");
      await agent.close();
    `);
  });

  it("lets a later setGlobalDispatcher reach built-in fetch when Shepherd loads Undici first", async () => {
    await runFreshProcess(`
      process.env.HTTP_PROXY = "http://127.0.0.1:9";
      const { githubFetch } = await import("./src/github/github-fetch.mts");
      const controller = new AbortController();
      controller.abort();
      await githubFetch("http://example.invalid/", { signal: controller.signal }).catch((error) => {
        if (error?.name !== "AbortError") throw error;
      });
      const { Agent, setGlobalDispatcher } = await import("undici");
      const { createServer } = await import("node:http");
      let count = 0;
      class CountingAgent extends Agent {
        dispatch(options, handler) {
          count += 1;
          return super.dispatch(options, handler);
        }
      }
      const agent = new CountingAgent();
      setGlobalDispatcher(agent);
      const server = createServer((_request, response) => response.end("ok"));
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const { port } = server.address();
      const response = await fetch("http://127.0.0.1:" + port + "/");
      const body = await response.text();
      server.closeAllConnections();
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await agent.close();
      if (body !== "ok" || count < 1) {
        throw new Error("built-in fetch did not use the replacement dispatcher (" + count + ")");
      }
    `);
  });
});
