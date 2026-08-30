import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import {
  registerHooks,
  REPO,
  makeCheck,
  mockFetch,
  triageFailingChecks,
} from "../../test-helpers/checks/triage.test-support.mts";

registerHooks();

const stateKey = { owner: REPO.owner, repo: REPO.name, pr: 9 };
let testStateDir: string;

beforeEach(() => {
  testStateDir = `${process.env["TMPDIR"] ?? "/tmp"}/shepherd-triage-jobsetag-test-${randomBytes(4).toString("hex")}`;
  process.env["PR_SHEPHERD_STATE_DIR"] = testStateDir;
});

afterEach(async () => {
  delete process.env["PR_SHEPHERD_STATE_DIR"];
  await rm(testStateDir, { recursive: true, force: true });
});

// A job whose name doesn't match the check name so pickJobInfo finds no
// match — isolates this test to the jobs-list fetch/cache mechanism, with no
// log-excerpt fetch in the mix.
function jobsResponseWithEtag(etag: string): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json", etag }),
    json: () => Promise.resolve({ jobs: [{ id: 1, name: "other-job", conclusion: "success" }] }),
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

describe("triageFailingChecks — jobs-list ETag cache", () => {
  it("sends If-None-Match on the second tick using the stored etag", async () => {
    mockFetch.mockResolvedValueOnce(jobsResponseWithEtag('W/"jobs-v1"'));
    await triageFailingChecks([makeCheck({ name: "tests" })], REPO, stateKey);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    mockFetch.mockClear();
    mockFetch.mockResolvedValueOnce(notModified());
    await triageFailingChecks([makeCheck({ name: "tests" })], REPO, stateKey);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["If-None-Match"]).toBe('W/"jobs-v1"');
  });

  it("does not send If-None-Match when stateKey is omitted", async () => {
    mockFetch.mockResolvedValueOnce(jobsResponseWithEtag('W/"jobs-v1"'));
    await triageFailingChecks([makeCheck({ name: "tests" })], REPO);

    mockFetch.mockClear();
    mockFetch.mockResolvedValueOnce(jobsResponseWithEtag('W/"jobs-v1"'));
    await triageFailingChecks([makeCheck({ name: "tests" })], REPO);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["If-None-Match"]).toBeUndefined();
  });
});
