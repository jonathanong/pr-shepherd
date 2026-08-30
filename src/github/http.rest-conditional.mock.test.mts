import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import { registerHooks, jsonOk, mockFetch } from "../../test-helpers/github/http.test-support.mts";
import { restWithRateLimit } from "./http.mts";

registerHooks();

const stateKey = { owner: "owner", repo: "repo", pr: 1 };
let testStateDir: string;

beforeEach(() => {
  process.env["GH_TOKEN"] = "tok";
  testStateDir = `${process.env["TMPDIR"] ?? "/tmp"}/shepherd-rest-conditional-test-${randomBytes(4).toString("hex")}`;
  process.env["PR_SHEPHERD_STATE_DIR"] = testStateDir;
});

afterEach(async () => {
  delete process.env["PR_SHEPHERD_STATE_DIR"];
  await rm(testStateDir, { recursive: true, force: true });
});

function jsonOkWithEtag(data: unknown, etag: string): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json", etag }),
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as unknown as Response;
}

function notModified(): Response {
  return {
    ok: false,
    status: 304,
    headers: new Headers(),
    text: () => Promise.resolve(""),
  } as unknown as Response;
}

describe("restWithRateLimit — conditional requests", () => {
  it("stores the etag on a 200 response and does not send If-None-Match on the first call", async () => {
    mockFetch.mockResolvedValue(jsonOkWithEtag({ jobs: [1] }, 'W/"v1"'));

    const result = await restWithRateLimit("GET", "/repos/o/r/actions/runs/1/jobs", undefined, {
      conditional: { key: stateKey, name: "jobs-run-1-p1" },
    });

    expect(result.data).toEqual({ jobs: [1] });
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["If-None-Match"]).toBeUndefined();
  });

  it("sends If-None-Match on the second call and returns the cached body on 304 without re-parsing", async () => {
    mockFetch.mockResolvedValueOnce(jsonOkWithEtag({ jobs: [1] }, 'W/"v1"'));
    const first = await restWithRateLimit("GET", "/repos/o/r/actions/runs/1/jobs", undefined, {
      conditional: { key: stateKey, name: "jobs-run-1-p1" },
    });

    mockFetch.mockResolvedValueOnce(notModified());
    const second = await restWithRateLimit("GET", "/repos/o/r/actions/runs/1/jobs", undefined, {
      conditional: { key: stateKey, name: "jobs-run-1-p1" },
    });

    const [, init] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["If-None-Match"]).toBe('W/"v1"');
    // Parity: a 304 must return data identical to the prior 200.
    expect(second.data).toEqual(first.data);
  });

  it("refreshes the cache when a later request returns 200 with new content", async () => {
    mockFetch.mockResolvedValueOnce(jsonOkWithEtag({ jobs: [1] }, 'W/"v1"'));
    await restWithRateLimit("GET", "/repos/o/r/actions/runs/1/jobs", undefined, {
      conditional: { key: stateKey, name: "jobs-run-1-p1" },
    });

    mockFetch.mockResolvedValueOnce(jsonOkWithEtag({ jobs: [1, 2] }, 'W/"v2"'));
    const updated = await restWithRateLimit("GET", "/repos/o/r/actions/runs/1/jobs", undefined, {
      conditional: { key: stateKey, name: "jobs-run-1-p1" },
    });
    expect(updated.data).toEqual({ jobs: [1, 2] });

    mockFetch.mockResolvedValueOnce(notModified());
    const third = await restWithRateLimit("GET", "/repos/o/r/actions/runs/1/jobs", undefined, {
      conditional: { key: stateKey, name: "jobs-run-1-p1" },
    });
    const [, init] = mockFetch.mock.calls[2] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["If-None-Match"]).toBe('W/"v2"');
    expect(third.data).toEqual({ jobs: [1, 2] });
  });

  it("does not cache or send If-None-Match when no conditional option is passed", async () => {
    mockFetch.mockResolvedValue(jsonOk({ jobs: [] }));
    await restWithRateLimit("GET", "/repos/o/r/actions/runs/1/jobs");
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["If-None-Match"]).toBeUndefined();
  });

  it("returns the cached body on a 304 reached after a 401 token-refresh retry", async () => {
    mockFetch.mockResolvedValueOnce(jsonOkWithEtag({ jobs: [1] }, 'W/"v1"'));
    await restWithRateLimit("GET", "/repos/o/r/actions/runs/1/jobs", undefined, {
      conditional: { key: stateKey, name: "jobs-run-1-p1" },
    });

    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers(),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        text: () => Promise.resolve("Unauthorized"),
      })
      .mockResolvedValueOnce(notModified());

    const result = await restWithRateLimit("GET", "/repos/o/r/actions/runs/1/jobs", undefined, {
      conditional: { key: stateKey, name: "jobs-run-1-p1" },
    });

    expect(result.data).toEqual({ jobs: [1] });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
