import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";

vi.mock("./client.mts", () => ({ graphqlWithRateLimit: vi.fn() }));

import { graphqlWithRateLimit } from "./client.mts";
import { loadBaseBehindBy } from "./merge-target-rules.mts";
import { runWithGithubTransport } from "./transport.mts";
import { loadDerived, storeDerived } from "../state/rest-cache.mts";

const graphql = vi.mocked(graphqlWithRateLimit);
const stateKey = { owner: "acme", repo: "widgets", pr: 7 };
const HEAD = "c".repeat(40);
const TIP = "b".repeat(40);
const NEWER_TIP = "d".repeat(40);
let stateDir: string;

function respond(behindBy: number, tip: string | null = TIP) {
  graphql.mockResolvedValueOnce({
    data: {
      repository: { ref: { target: tip ? { oid: tip } : null, compare: { behindBy } } },
    },
  } as Awaited<ReturnType<typeof graphqlWithRateLimit>>);
}

function load(head = HEAD, baseTipOid: string | null = TIP) {
  return runWithGithubTransport("graphql", () =>
    loadBaseBehindBy("acme", "widgets", "main", head, {
      stateKey,
      ...(baseTipOid && { baseTipOid }),
    }),
  );
}

beforeEach(() => {
  graphql.mockReset();
  stateDir = `${process.env["TMPDIR"] ?? "/tmp"}/shepherd-base-behind-${randomBytes(4).toString("hex")}`;
  process.env["PR_SHEPHERD_STATE_DIR"] = stateDir;
});

afterEach(async () => {
  delete process.env["PR_SHEPHERD_STATE_DIR"];
  await rm(stateDir, { recursive: true, force: true });
});

describe("loadBaseBehindBy cache", () => {
  it("reads once, then answers the same base tip and head from the cache", async () => {
    respond(5);

    await expect(load()).resolves.toBe(5);
    await expect(load()).resolves.toBe(5);

    expect(graphql).toHaveBeenCalledTimes(1);
  });

  it("re-reads when the base tip moves", async () => {
    respond(5);
    respond(6, NEWER_TIP);

    await load();
    await expect(load(HEAD, NEWER_TIP)).resolves.toBe(6);
    await expect(load(HEAD, NEWER_TIP)).resolves.toBe(6);

    expect(graphql).toHaveBeenCalledTimes(2);
  });

  it("re-reads when the head moves", async () => {
    respond(5);
    respond(0);

    await load();
    await expect(load("e".repeat(40))).resolves.toBe(0);

    expect(graphql).toHaveBeenCalledTimes(2);
  });

  it("keys the entry on the tip the compare used, not the caller's", async () => {
    respond(6, NEWER_TIP);

    await load();

    expect((await loadDerived(stateKey, "base-behind"))?.value).toEqual({
      baseTipOid: NEWER_TIP,
      headOid: HEAD,
      behindBy: 6,
    });
    respond(6, NEWER_TIP);
    await load();
    expect(graphql).toHaveBeenCalledTimes(2);
  });

  it("does not read the cache without a base tip", async () => {
    respond(5);
    respond(5);

    await load();
    await load(HEAD, null);

    expect(graphql).toHaveBeenCalledTimes(2);
  });

  it("neither reads nor writes for a head that is not a commit OID", async () => {
    respond(5);
    respond(5);

    await load("feature");
    await load("feature");

    expect(graphql).toHaveBeenCalledTimes(2);
    expect(await loadDerived(stateKey, "base-behind")).toBeNull();
  });

  it("does not store a compare without a tip", async () => {
    respond(5, null);

    await load();

    expect(await loadDerived(stateKey, "base-behind")).toBeNull();
  });

  it("ignores a malformed cached count", async () => {
    await storeDerived(stateKey, "base-behind", { baseTipOid: TIP, headOid: HEAD, behindBy: -1 });
    respond(3);

    await expect(load()).resolves.toBe(3);
    expect(graphql).toHaveBeenCalledTimes(1);
  });
});
