import { existsSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./process-start.mts", () => ({ readProcessStart: vi.fn(() => "start-A") }));

type Handler = () => void;

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

async function load() {
  const handlers = new Map<string, Handler>();
  const on = vi.spyOn(process, "on").mockImplementation(((event: string, handler: Handler) => {
    handlers.set(event, handler);
    return process;
  }) as never);
  const once = vi.spyOn(process, "once").mockImplementation(((event: string, handler: Handler) => {
    handlers.set(event, handler);
    return process;
  }) as never);
  const kill = vi.spyOn(process, "kill").mockImplementation((() => true) as never);
  const lock = await import("./watch-lock.mts");
  const { resolvePrStatePath } = await import("./base.mts");
  const repo = { owner: "acme", name: `hooks-${Math.random().toString(36).slice(2)}` };
  const file = (pr: number) =>
    resolvePrStatePath({ owner: repo.owner, repo: repo.name, pr }, "watch.lock.json");
  return { handlers, on, once, kill, lock, repo, file };
}

describe("watch lock process hooks", () => {
  it("registers exit and signal handlers once, however many locks are taken", async () => {
    const { on, once, lock, repo } = await load();
    lock.acquireWatchLock(repo, 1, []);
    lock.acquireWatchLock(repo, 2, []);
    expect(on.mock.calls.filter(([event]) => event === "exit")).toHaveLength(1);
    expect(once.mock.calls.map(([event]) => event)).toEqual(["SIGINT", "SIGTERM"]);
    lock.releaseAllWatchLocks();
  });

  it("releases every lock on process exit", async () => {
    const { handlers, lock, repo, file } = await load();
    lock.acquireWatchLock(repo, 1, []);
    lock.acquireWatchLock(repo, 2, []);
    expect(existsSync(file(1))).toBe(true);
    handlers.get("exit")!();
    expect(existsSync(file(1))).toBe(false);
    expect(existsSync(file(2))).toBe(false);
  });

  it.each(["SIGINT", "SIGTERM"] as const)(
    "releases locks on %s and re-raises the signal",
    async (signal) => {
      const { handlers, kill, lock, repo, file } = await load();
      lock.acquireWatchLock(repo, 1, []);
      handlers.get(signal)!();
      expect(existsSync(file(1))).toBe(false);
      expect(kill).toHaveBeenCalledWith(process.pid, signal);
    },
  );
});
