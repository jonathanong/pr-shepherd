import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPullExists, mockStackByNumber, mockTopology, mockRepoInfo } = vi.hoisted(() => ({
  mockPullExists: vi.fn(),
  mockStackByNumber: vi.fn(),
  mockTopology: vi.fn(),
  mockRepoInfo: vi.fn(),
}));

vi.mock("../github/rest-stack-read.mts", () => ({
  restPullExists: mockPullExists,
  readRestStackByNumber: mockStackByNumber,
}));
vi.mock("../github/stack-read.mts", () => ({ readStackTopology: mockTopology }));
vi.mock("../github/client.mts", () => ({ getRepoInfo: mockRepoInfo }));

import { EXIT, ShepherdError } from "../exit-codes.mts";
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
  it("takes one PR URL without any read and owns the whole stack", async () => {
    const target = await resolveStackTarget({ refs: [url(12)] });
    expect(target).toEqual({
      anchor: 12,
      targetRepository: { owner: "acme", name: "widgets" },
    });
    expect(mockPullExists).not.toHaveBeenCalled();
    expect(mockTopology).not.toHaveBeenCalled();
    expect(mockRepoInfo).not.toHaveBeenCalled();
  });

  it("reads a bare number as a PR first and owns the whole stack", async () => {
    const target = await resolveStackTarget({ refs: [ref("12")] });
    expect(target).toEqual({ anchor: 12 });
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

  it("rejects refs from different repositories", async () => {
    await expect(resolveStackTarget({ refs: [url(11), ref("other/widgets#12")] })).rejects.toThrow(
      "stack refs must all name one repository.",
    );
    await expect(
      resolveStackTarget({ refs: [url(11)], through: ref("other/widgets#11") }),
    ).rejects.toThrow("stack refs must all name one repository.");
  });
});

describe("resolveStackTarget across stacks", () => {
  it("names each stack with its refs and one command per stack", async () => {
    const error = await resolveStackTarget({
      refs: [url(11), url(21), ref("5")],
      merge: "merge",
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ShepherdError);
    const { message, exitCode } = error as ShepherdError;
    expect(exitCode).toBe(EXIT.USAGE);
    expect(message.split("\n")[0]).toBe("These refs span 2 stacks. Run one command per stack:");
    expect(message).toContain("- stack #5 (stack #5, #11):");
    expect(message).toContain("- stack #6 (#21):");
    expect(message).toContain("--until-terminal --merge`");
  });

  it("repeats a stack number's own ref for each stack number given", async () => {
    const error = (await resolveStackTarget({ refs: [ref("5"), ref("6")] }).catch(
      (caught: unknown) => caught,
    )) as ShepherdError;
    expect(error.message).toContain("These refs span 2 stacks.");
    expect(error.message).toContain(
      '- stack #5 (stack #5): `pr-shepherd stack "acme/widgets#5" --until-terminal`',
    );
    expect(error.message).toContain(
      '- stack #6 (stack #6): `pr-shepherd stack "acme/widgets#6" --until-terminal`',
    );
  });
});

describe("resolveStackTarget --merge-through", () => {
  it("returns the through PR when it is a layer of the stack", async () => {
    const target = await resolveStackTarget({
      refs: [url(11)],
      through: url(12),
      merge: "through",
    });
    expect(target).toMatchObject({ anchor: 11, through: 12 });
    expect(target.owned).toBeUndefined();
  });

  it("rejects a through PR outside the stack", async () => {
    await expect(resolveStackTarget({ refs: [url(11)], through: url(21) })).rejects.toThrow(
      "--merge-through PR #21 is not a layer of native stack #5.",
    );
  });

  it("rejects a through PR the caller did not list as its own", async () => {
    await expect(
      resolveStackTarget({ refs: [url(11), url(12)], through: url(13) }),
    ).rejects.toThrow("--merge-through PR #13 is not one of the PRs listed as yours.");
  });

  it("accepts a bare through number only when it is a pull request", async () => {
    const target = await resolveStackTarget({ refs: [url(11)], through: ref("12") });
    expect(target).toMatchObject({ through: 12 });
    mockPullExists.mockResolvedValue(false);
    await expect(resolveStackTarget({ refs: [url(11)], through: ref("12") })).rejects.toThrow(
      "--merge-through takes a pull request; #12 is a stack number.",
    );
  });

  it("repeats --merge-through only in the command for the stack that holds it", async () => {
    const error = (await resolveStackTarget({
      refs: [url(11), url(21)],
      through: url(12),
      merge: "through",
    }).catch((caught: unknown) => caught)) as ShepherdError;
    expect(error.message).toContain("- stack #5 (#11):");
    expect(error.message).toContain("--merge-through https://github.com/acme/widgets/pull/12");
    const other = error.message.split("\n").find((line) => line.includes("stack #6"))!;
    expect(other).not.toContain("--merge-through");
  });
});
