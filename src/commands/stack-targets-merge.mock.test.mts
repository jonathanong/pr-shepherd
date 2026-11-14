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
import { parseCliPrReference, type ParsedPrReference } from "../pr-reference.mts";
import { resolveStackTarget } from "./stack-targets.mts";

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

  it("names the stack tool call instead of a CLI command for a tool caller", async () => {
    const error = (await resolveStackTarget({
      refs: [url(11), url(21)],
      merge: "through",
      through: url(12),
      tool: true,
    }).catch((caught: unknown) => caught)) as ShepherdError;
    expect(error.message).toContain(
      '- stack #5 (#11): `stack {"refs":["https://github.com/acme/widgets/pull/11"],"mergeThrough":"https://github.com/acme/widgets/pull/12"}`',
    );
    expect(error.message).toContain(
      '- stack #6 (#21): `stack {"refs":["https://github.com/acme/widgets/pull/21"]}`',
    );
    expect(error.message).not.toContain("--until-terminal");
    const ready = (await resolveStackTarget({
      refs: [url(11), url(21)],
      merge: "ready",
      tool: true,
    }).catch((caught: unknown) => caught)) as ShepherdError;
    expect(ready.message).toContain('"mergeReady":true');
    const all = (await resolveStackTarget({
      refs: [url(11), url(21)],
      merge: "merge",
      tool: true,
    }).catch((caught: unknown) => caught)) as ShepherdError;
    expect(all.message).toContain('"merge":true');
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
      refs: [url(11), url(12)],
      through: url(12),
      merge: "through",
    });
    expect(target).toMatchObject({ anchor: 11, through: 12 });
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
    const target = await resolveStackTarget({ refs: [url(11), url(12)], through: ref("12") });
    expect(target).toMatchObject({ through: 12 });
    mockPullExists.mockResolvedValue(false);
    await expect(
      resolveStackTarget({ refs: [url(11), url(12)], through: ref("12") }),
    ).rejects.toThrow("--merge-through takes a pull request; #12 is a stack number.");
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
