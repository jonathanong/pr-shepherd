import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPullExists, mockStackByNumber, mockTopology, mockRepoInfo, mockRepoReachable } =
  vi.hoisted(() => ({
    mockRepoReachable: vi.fn(),
    mockPullExists: vi.fn(),
    mockStackByNumber: vi.fn(),
    mockTopology: vi.fn(),
    mockRepoInfo: vi.fn(),
  }));

vi.mock("../github/rest-stack-read.mts", () => ({
  restPullExists: mockPullExists,
  readRestStackByNumber: mockStackByNumber,
  restRepoReachable: mockRepoReachable,
}));
vi.mock("../github/stack-read.mts", () => ({ readStackTopology: mockTopology }));
vi.mock("../github/client.mts", () => ({ getRepoInfo: mockRepoInfo }));

import { EXIT, ShepherdError } from "../exit-codes.mts";
import { GitHubRequestError } from "../github/errors.mts";
import { parseCliPrReference, type ParsedPrReference } from "../pr-reference.mts";
import { resolveStackTarget, stackMergeScope } from "./stack-targets.mts";

const ref = (value: string): ParsedPrReference => parseCliPrReference(value)!;
const url = (n: number) => ref(`https://github.com/acme/widgets/pull/${n}`);

/** PR numbers 11-13 are stack 5; PR numbers 21-22 are stack 6; 5 and 6 are the stack numbers. */
const STACKS: Record<number, { number: number; members: number[] }> = {
  5: { number: 5, members: [11, 12, 13] },
  6: { number: 6, members: [21, 22] },
};

function topologyFor(pr: number) {
  const found = Object.values(STACKS).find((stack) => stack.members.includes(pr));
  if (!found) throw new ShepherdError(`PR #${pr} is not part of a native GitHub stack`, 1);
  return {
    stackNumber: found.number,
    ordered: found.members.map((number) => ({ number })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRepoInfo.mockResolvedValue({ owner: "acme", name: "widgets" });
  mockRepoReachable.mockResolvedValue(true);
  mockPullExists.mockImplementation(async (n: number) => !STACKS[n]);
  mockStackByNumber.mockImplementation(async (n: number) => STACKS[n] ?? null);
  mockTopology.mockImplementation(async (pr: number) => topologyFor(pr));
});

describe("stackMergeScope", () => {
  it("maps each merge flag to its scope", () => {
    expect(stackMergeScope(undefined, undefined)).toBeUndefined();
    expect(stackMergeScope("merge", undefined)).toEqual({ kind: "all" });
    expect(stackMergeScope("ready", undefined)).toEqual({ kind: "ready" });
    expect(stackMergeScope("through", 12)).toEqual({ kind: "through", pr: 12 });
  });
});

describe("resolveStackTarget", () => {
  it("takes one PR URL without any read and owns only that PR", async () => {
    const target = await resolveStackTarget({ refs: [url(12)] });
    expect(target).toEqual({
      anchor: 12,
      owned: [12],
      targetRepository: { owner: "acme", name: "widgets" },
    });
    expect(mockPullExists).not.toHaveBeenCalled();
    expect(mockTopology).not.toHaveBeenCalled();
    expect(mockRepoInfo).not.toHaveBeenCalled();
  });

  it("reads a bare number as a PR first and owns only that PR", async () => {
    const target = await resolveStackTarget({ refs: [ref("12")] });
    expect(target).toEqual({ anchor: 12, owned: [12] });
    expect(mockPullExists).toHaveBeenCalledWith(12, { owner: "acme", name: "widgets" });
    expect(mockTopology).toHaveBeenCalledOnce();
  });

  it("falls back to a stack number when no PR has that number", async () => {
    const target = await resolveStackTarget({ refs: [ref("5")] });
    expect(target).toEqual({ anchor: 11 });
    expect(mockStackByNumber).toHaveBeenCalledWith(5, { owner: "acme", name: "widgets" });
  });

  it("accepts a stack number named with its repository", async () => {
    const target = await resolveStackTarget({ refs: [ref("acme/widgets#6")] });
    expect(target).toEqual({
      anchor: 21,
      targetRepository: { owner: "acme", name: "widgets" },
    });
    expect(mockRepoInfo).not.toHaveBeenCalled();
  });

  it("owns only the listed PRs when several PRs of one stack are given", async () => {
    const target = await resolveStackTarget({ refs: [url(11), url(13), ref("13")] });
    expect(target).toMatchObject({ anchor: 11, owned: [11, 13] });
    // Once a PR's stack is read, the other numbers of that stack need no further reads.
    expect(mockTopology).toHaveBeenCalledOnce();
  });

  it("reads a second bare number only until the stack is known", async () => {
    await resolveStackTarget({ refs: [ref("11"), ref("12")] });
    expect(mockPullExists).toHaveBeenCalledOnce();
    expect(mockTopology).toHaveBeenCalledOnce();
  });

  it("rejects a stack number together with any other ref", async () => {
    await expect(resolveStackTarget({ refs: [ref("5"), ref("11")] })).rejects.toMatchObject({
      exitCode: EXIT.USAGE,
      message: expect.stringContaining("stack #5 is named together with other refs"),
    });
  });

  it("rejects a number that is neither a PR nor a stack", async () => {
    mockPullExists.mockResolvedValue(false);
    mockStackByNumber.mockResolvedValue(null);
    await expect(resolveStackTarget({ refs: [ref("99")] })).rejects.toThrow(
      "#99 is neither a pull request nor a native stack in acme/widgets.",
    );
  });

  it("reports an inaccessible repository instead of a missing PR or stack", async () => {
    mockPullExists.mockResolvedValue(false);
    mockStackByNumber.mockResolvedValue(null);
    mockRepoReachable.mockResolvedValue(false);
    await expect(resolveStackTarget({ refs: [ref("99")] })).rejects.toMatchObject({
      exitCode: EXIT.NOPERM,
      message: expect.stringContaining("acme/widgets is not accessible"),
    });
  });

  it("reports a 403 as an access problem", async () => {
    mockPullExists.mockRejectedValue(new GitHubRequestError("forbidden", { status: 403 }));
    await expect(resolveStackTarget({ refs: [ref("12")] })).rejects.toMatchObject({
      exitCode: EXIT.NOPERM,
      message: expect.stringContaining("GitHub denied access to acme/widgets (HTTP 403)"),
    });
  });

  it("lets other read failures through unchanged", async () => {
    mockPullExists.mockRejectedValue(new Error("boom"));
    await expect(resolveStackTarget({ refs: [ref("12")] })).rejects.toThrow("boom");
  });

  it("rejects refs from different repositories", async () => {
    await expect(resolveStackTarget({ refs: [url(11), ref("other/widgets#12")] })).rejects.toThrow(
      "stack refs must all name one repository.",
    );
    await expect(
      resolveStackTarget({ refs: [url(11)], through: ref("other/widgets#11") }),
    ).rejects.toThrow("stack refs must all name one repository.");
  });
});
