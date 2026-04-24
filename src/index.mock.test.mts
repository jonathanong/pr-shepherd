import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockMain } = vi.hoisted(() => ({ mockMain: vi.fn() }));

vi.mock("./cli-parser.mts", () => ({ main: mockMain }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let exitSpy: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stderrSpy: any;

beforeEach(() => {
  vi.resetModules();
  mockMain.mockReset();
  exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as () => never);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  exitSpy.mockRestore();
  stderrSpy.mockRestore();
});

async function loadIndex() {
  await import("./index.mts");
  // Flush the microtask queue so the .catch() handler runs
  await Promise.resolve();
}

describe("index — error exit", () => {
  it("writes 'pr-shepherd error: <message>' to stderr and exits 1 when main rejects with Error", async () => {
    mockMain.mockRejectedValueOnce(new Error("something broke"));
    await loadIndex();
    expect(stderrSpy).toHaveBeenCalledWith("pr-shepherd error: something broke\n");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("stringifies non-Error rejections", async () => {
    mockMain.mockRejectedValueOnce("not an error object");
    await loadIndex();
    expect(stderrSpy).toHaveBeenCalledWith("pr-shepherd error: not an error object\n");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("appends cause when err.cause is set", async () => {
    const err = new Error("fetch failed");
    err.cause = new Error("getaddrinfo ENOTFOUND api.github.com");
    mockMain.mockRejectedValueOnce(err);
    await loadIndex();
    const written = stderrSpy.mock.calls[0][0] as string;
    expect(written).toMatch(
      /^pr-shepherd error: fetch failed \(cause: Error: getaddrinfo ENOTFOUND api\.github\.com/,
    );
    expect(written).toMatch(/\)\n$/);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("does not recurse infinitely for circular cause chains", async () => {
    const err = new Error("outer");
    err.cause = err;
    mockMain.mockRejectedValueOnce(err);
    await loadIndex();
    const written = stderrSpy.mock.calls[0][0] as string;
    expect(written).toContain("[circular or deep cause chain]");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("truncates deeply nested cause chains at max depth", async () => {
    let cause: Error = new Error("deepest");
    for (let i = 0; i < 7; i++) {
      const next = new Error(`level ${i}`);
      next.cause = cause;
      cause = next;
    }
    mockMain.mockRejectedValueOnce(cause);
    await loadIndex();
    const written = stderrSpy.mock.calls[0][0] as string;
    expect(written).toContain("[circular or deep cause chain]");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
