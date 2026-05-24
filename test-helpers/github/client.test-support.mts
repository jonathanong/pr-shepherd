import { vi, beforeEach, afterEach } from "vitest";
import { _resetTokenCache } from "../../src/github/http.mts";

export const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { _mockExecFile } = vi.hoisted(() => ({ _mockExecFile: vi.fn() }));
export const mockExecFile = _mockExecFile;

vi.mock("node:child_process", () => ({
  execFile: (
    cmd: string,
    args: string[],
    optsOrCb:
      | Record<string, unknown>
      | ((err: Error | null, result: { stdout: string; stderr: string }) => void),
    maybeCb?: (err: Error | null, result: { stdout: string; stderr: string }) => void,
  ) => {
    const cb = typeof optsOrCb === "function" ? optsOrCb : maybeCb!;
    _mockExecFile(cmd, args)
      .then((result: { stdout: string; stderr: string }) => cb(null, result))
      .catch((err: Error) => cb(err, { stdout: "", stderr: "" }));
  },
}));

export function gqlOk(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve({ data }),
    text: () => Promise.resolve(JSON.stringify({ data })),
  } as unknown as Response;
}

export function restOk(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as unknown as Response;
}

export function gqlErrors(errors: Array<{ message: string }>): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve({ data: null, errors }),
    text: () => Promise.resolve(JSON.stringify({ data: null, errors })),
  } as unknown as Response;
}

export function registerClientHooks(): void {
  beforeEach(() => {
    mockFetch.mockReset();
    mockExecFile.mockReset();
    _resetTokenCache();
    delete process.env["GITHUB_TOKEN"];
    delete process.env["GITHUB_PERSONAL_ACCESS_TOKEN"];
    process.env["GH_TOKEN"] = "test-token";
  });
  afterEach(() => {
    delete process.env["GH_TOKEN"];
    _resetTokenCache();
  });
}
