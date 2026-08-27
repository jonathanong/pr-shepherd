import { describe, expect, it } from "vitest";
import {
  SUGGESTIONS_RESULT,
  getStdout,
  mockRunSuggestionPatches,
  registerHooks,
  stderrSpy,
} from "../test-helpers/cli-parser.commit-suggestion.test-support.mts";
import { main } from "./cli-parser.mts";
import { EXIT } from "./exit-codes.mts";

registerHooks();

describe("main — build-suggestion-patches", () => {
  it("routes ordered suggestion groups", async () => {
    mockRunSuggestionPatches.mockResolvedValue(SUGGESTIONS_RESULT);
    await main([
      "node",
      "shepherd",
      "build-suggestion-patches",
      "42",
      "--thread-id",
      "t1",
      "--message",
      "first fix",
      "--description",
      "first detail",
      "--thread-id=t2",
      "--message=second fix",
      "--format=json",
    ]);
    expect(mockRunSuggestionPatches).toHaveBeenCalledWith({
      format: "json",
      verbose: false,
      prNumber: 42,
      suggestions: [
        { threadId: "t1", message: "first fix", description: "first detail" },
        { threadId: "t2", message: "second fix" },
      ],
    });
    expect(JSON.parse(getStdout())).toEqual(SUGGESTIONS_RESULT);
    expect(stderrSpy).not.toHaveBeenCalledWith(expect.stringContaining("deprecated"));
  });

  it("rejects incomplete suggestion groups", async () => {
    await main([
      "node",
      "shepherd",
      "build-suggestion-patches",
      "42",
      "--thread-id",
      "t1",
      "--message",
      "first",
      "--thread-id",
      "t2",
    ]);
    expect(process.exitCode).toBe(EXIT.USAGE);
    expect(mockRunSuggestionPatches).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("--message is required"));
  });
});
