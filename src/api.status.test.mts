/* eslint-disable max-lines */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pull, serve, wire } from "../test-helpers/github/rest-read.test-support.mts";
import { makeRawPr, makeResponse } from "../test-helpers/github/batch-fixtures.mts";
import { createPrShepherd } from "./api.mts";
import { formatIterateResult } from "./cli/iterate-formatter.mts";
import { resolvePrStatePath } from "./state/base.mts";

const REF = "owner/repo#42";
const KEY = { owner: "owner", repo: "repo", pr: 42 };
const HEAD = "a".repeat(40);
const page = { pageInfo: { hasPreviousPage: false, startCursor: null }, nodes: [] };

let stateDir: string;
let cwd: string;
let raw: ReturnType<typeof makeRawPr>;

/** A PR with finished passing CI, an approval and a clean merge state. */
function readyPr(overrides: Record<string, unknown> = {}) {
  const check = { status: "COMPLETED", conclusion: "SUCCESS" };
  return makeRawPr({
    headRefOid: HEAD,
    baseRef: { rules: { pageInfo: { hasNextPage: false }, nodes: [] } },
    commits: {
      totalCount: 1,
      nodes: [
        {
          commit: {
            oid: HEAD,
            committedDate: "2026-10-09T00:00:00Z",
            statusCheckRollup: {
              state: "SUCCESS",
              contexts: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [{ __typename: "CheckRun", id: "CR_1", name: "ci", ...check }],
              },
            },
            checkSuites: {
              pageInfo: { hasNextPage: false },
              nodes: [{ id: "CS_1", ...check, workflowRun: null }],
            },
          },
        },
      ],
    },
    ...overrides,
  });
}

async function serveRaw(): Promise<void> {
  await serve((request, response) => {
    const path = request.path.split("?")[0]!;
    if (path === "/graphql") response.end(JSON.stringify(makeResponse(raw, "me")));
    else if (path === "/repos/owner/repo/pulls/42") {
      const state = raw["isDraft"] ? "draft" : "clean";
      response.end(
        JSON.stringify({ ...pull, number: 42, draft: raw["isDraft"], mergeable_state: state }),
      );
    } else if (path === "/user") response.end('{"login":"me"}');
    else response.end("[]");
  });
}

const mutations = () =>
  wire.requests.filter((request) =>
    request.path.split("?")[0] === "/graphql"
      ? /^\s*mutation\b/.test(String(request.body["query"] ?? ""))
      : request.method !== "GET" && request.method !== "HEAD",
  );

const listing = (dir: string) => readdirSync(dir, { recursive: true }).map(String);

const outdatedThread = {
  id: "PRRT_outdated",
  isResolved: false,
  isOutdated: true,
  viewerCanResolve: true,
  comments: {
    nodes: [
      {
        id: "PRRC_outdated",
        isMinimized: false,
        author: { login: "alice" },
        body: "old feedback",
        path: "src/a.mts",
        line: 3,
        createdAt: "2026-10-09T00:00:00Z",
      },
    ],
  },
};
const codecovComment = {
  id: "IC_codecov",
  isMinimized: false,
  viewerCanMinimize: true,
  author: { login: "codecov", __typename: "Bot" },
  body: "## [Codecov](https://app.codecov.io/gh/o/r/pull/42) Report\nAll modified lines are covered.",
  createdAt: "2026-10-09T00:00:00Z",
};

beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), "shepherd-status-state-"));
  cwd = mkdtempSync(join(tmpdir(), "shepherd-status-cwd-"));
  vi.stubEnv("PR_SHEPHERD_STATE_DIR", stateDir);
  // githubFetch also honors the lowercase proxy variables, which the wire helper does not clear.
  vi.stubEnv("http_proxy", "");
  vi.stubEnv("https_proxy", "");
  raw = readyPr();
});
afterEach(() => {
  rmSync(stateDir, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
});

describe("createPrShepherd().status", () => {
  it("returns merge with the evaluated head for a READY PR and writes nothing", async () => {
    await serveRaw();
    const result = await createPrShepherd({ cwd, transport: "graphql" }).status({
      pr: REF,
      merge: true,
      readyDelaySeconds: 0,
    });
    expect(result).toMatchObject({ action: "merge", headSha: HEAD, pr: 42 });
    expect(listing(stateDir)).toEqual([]);
    expect(mutations()).toEqual([]);
  });

  it("keeps first-look items for a following iterate and sends no mutation", async () => {
    raw = readyPr({
      reviewThreads: { ...page, nodes: [outdatedThread] },
      comments: { ...page, nodes: [codecovComment] },
    });
    await serveRaw();
    const shepherd = createPrShepherd({ cwd, transport: "graphql" });
    const checked = await shepherd.status({ pr: REF, readyDelaySeconds: 0 });
    expect(checked.action).toBe("triage");
    expect(checked.headSha).toBe(HEAD);
    expect(listing(stateDir)).toEqual([]);
    expect(mutations()).toEqual([]);
    const text = JSON.stringify(checked);
    expect(text).toContain("PRRT_outdated");
    expect(text).toContain("IC_codecov");

    // A real iterate has not been told these items were seen.
    const iterated = await shepherd.iterate({ pr: REF, readyDelaySeconds: 0 });
    expect(iterated.action).toBe("triage");
    expect(JSON.stringify(iterated)).toContain("PRRT_outdated");
    expect(listing(stateDir).length).toBeGreaterThan(0);
    // The detector is live: the real iterate auto-minimizes the rule-matched comment.
    expect(mutations().length).toBeGreaterThan(0);
  });

  it("reports a clean draft as cancel without marking it ready", async () => {
    raw = readyPr({ isDraft: true, mergeStateStatus: "DRAFT" });
    await serveRaw();
    const result = await createPrShepherd({ cwd, transport: "graphql" }).status({
      pr: REF,
      readyDelaySeconds: 0,
    });
    expect(result).toMatchObject({ action: "cancel", reason: "auto-mark-ready-disabled" });
    expect(mutations()).toEqual([]);
    expect(listing(stateDir)).toEqual([]);
  });

  it("leaves an existing ready-delay marker and seen markers byte-identical", async () => {
    const marker = resolvePrStatePath(KEY, "ready-since.txt");
    const seen = resolvePrStatePath(KEY, "seen", "existing.json");
    mkdirSync(join(marker, ".."), { recursive: true });
    mkdirSync(join(seen, ".."), { recursive: true });
    const past = Math.floor(Date.now() / 1000) - 30;
    writeFileSync(marker, `${past} ${HEAD}`);
    writeFileSync(seen, '{"seenAt":1,"id":"x"}');
    const before = listing(stateDir).sort();
    await serveRaw();
    const result = await createPrShepherd({ cwd, transport: "graphql" }).status({
      pr: REF,
      merge: true,
      readyDelaySeconds: 3600,
    });
    expect(result).toMatchObject({ action: "ready", headSha: HEAD });
    expect(result.remainingSeconds).toBeGreaterThan(3500);
    expect(result.remainingSeconds).toBeLessThanOrEqual(3570);
    expect(readFileSync(marker, "utf8")).toBe(`${past} ${HEAD}`);
    expect(readFileSync(seen, "utf8")).toBe('{"seenAt":1,"id":"x"}');
    expect(listing(stateDir).sort()).toEqual(before);
    expect(mutations()).toEqual([]);
  });

  it("starts the countdown at the full delay when no marker exists", async () => {
    await serveRaw();
    const result = await createPrShepherd({ cwd, transport: "graphql" }).status({
      pr: REF,
      readyDelaySeconds: 600,
    });
    expect(result).toMatchObject({ action: "ready", remainingSeconds: 600 });
    expect(listing(stateDir)).toEqual([]);
  });

  it("rejects a prs selector", async () => {
    await serveRaw();
    await expect(createPrShepherd({ cwd }).status({ prs: [REF] } as never)).rejects.toThrow(
      /one PR/,
    );
  });
});

describe("headSha on terminal results", () => {
  it("is carried by a merged cancel result and its text", async () => {
    raw = readyPr({ state: "MERGED", mergeStateStatus: "UNKNOWN" });
    await serveRaw();
    const result = await createPrShepherd({ cwd, transport: "graphql" }).iterate({ pr: REF });
    expect(result).toMatchObject({ action: "cancel", reason: "merged", headSha: HEAD });
    expect(formatIterateResult(result as never, { verbose: true })).toContain(HEAD);
    expect(formatIterateResult(result as never)).not.toContain(HEAD);
  });
});
