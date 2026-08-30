import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import {
  registerHooks,
  REPO,
  fetchStartupFailureChecks,
  mockFetch,
} from "../../test-helpers/checks/triage.test-support.mts";
import { loadEtagEntry } from "../state/rest-cache.mts";

registerHooks();

const stateKey = { owner: REPO.owner, repo: REPO.name, pr: 11 };
const headSha = "abc123";
let testStateDir: string;

beforeEach(() => {
  testStateDir = `${process.env["TMPDIR"] ?? "/tmp"}/shepherd-triage-startupfailure-etag-test-${randomBytes(4).toString("hex")}`;
  process.env["PR_SHEPHERD_STATE_DIR"] = testStateDir;
});

afterEach(async () => {
  delete process.env["PR_SHEPHERD_STATE_DIR"];
  await rm(testStateDir, { recursive: true, force: true });
});

function runsResponseWithEtag(etag: string): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json", etag }),
    json: () => Promise.resolve({ workflow_runs: [] }),
    text: () => Promise.resolve(""),
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

describe("fetchStartupFailureChecks — runs-list ETag cache", () => {
  it("stores the headSha alongside the etag entry and sends If-None-Match on the next tick", async () => {
    mockFetch.mockResolvedValueOnce(runsResponseWithEtag('W/"runs-v1"'));
    await fetchStartupFailureChecks(REPO, headSha, 42, stateKey);

    const entry = await loadEtagEntry(stateKey, `runs-startupfailure-${headSha}-p1`);
    expect(entry?.headSha).toBe(headSha);

    mockFetch.mockClear();
    mockFetch.mockResolvedValueOnce(notModified());
    await fetchStartupFailureChecks(REPO, headSha, 42, stateKey);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["If-None-Match"]).toBe('W/"runs-v1"');
  });

  it("does not use conditional requests when stateKey is omitted", async () => {
    mockFetch.mockResolvedValueOnce(runsResponseWithEtag('W/"runs-v1"'));
    await fetchStartupFailureChecks(REPO, headSha, 42);

    mockFetch.mockClear();
    mockFetch.mockResolvedValueOnce(runsResponseWithEtag('W/"runs-v1"'));
    await fetchStartupFailureChecks(REPO, headSha, 42);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["If-None-Match"]).toBeUndefined();
  });
});
