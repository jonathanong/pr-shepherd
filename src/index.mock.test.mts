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
  await new Promise<void>((r) => setTimeout(r, 0));
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
});
