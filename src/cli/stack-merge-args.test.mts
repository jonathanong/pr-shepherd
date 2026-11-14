import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXIT } from "../exit-codes.mts";
import { parseStackMerge } from "./stack-merge-args.mts";

let stderr: string;

beforeEach(() => {
  stderr = "";
  process.exitCode = undefined;
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });
});

afterEach(() => {
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

describe("parseStackMerge", () => {
  it("returns no flag when no merge option is given", () => {
    expect(parseStackMerge(["--until-terminal"])).toEqual({});
  });

  it.each([
    [["--merge"], "merge"],
    [["--merge-ready"], "ready"],
  ] as const)("reads %j", (args, flag) => {
    expect(parseStackMerge([...args])).toEqual({ flag });
  });

  it("reads --merge-through with its PR reference", () => {
    expect(parseStackMerge(["--merge-through", "acme/widgets#12"])).toEqual({
      flag: "through",
      through: { number: 12, repository: "acme/widgets" },
    });
    expect(parseStackMerge(["--merge-through", "12"])).toEqual({
      flag: "through",
      through: { number: 12 },
    });
  });

  it.each([
    [["--merge", "--merge-ready"]],
    [["--merge", "--merge-through", "5"]],
    [["--merge-ready", "--merge-through", "5"]],
    [["--merge", "--merge-ready", "--merge-through", "5"]],
  ])("rejects %j as mutually exclusive", (args) => {
    expect(parseStackMerge(args)).toBeNull();
    expect(stderr).toBe(
      "pr-shepherd: stack: --merge, --merge-ready, and --merge-through are mutually exclusive.\n",
    );
    expect(process.exitCode).toBe(EXIT.USAGE);
  });

  it.each([[["--merge-through"]], [["--merge-through", "not-a-pr"]]])(
    "rejects %j without a PR reference",
    (args) => {
      expect(parseStackMerge(args)).toBeNull();
      expect(stderr).toBe("pr-shepherd: stack: --merge-through requires a PR reference.\n");
      expect(process.exitCode).toBe(EXIT.USAGE);
    },
  );
});
