import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  mockApplyResolveOptions,
} from "../../test-helpers/commands/resolve.test-support.mts";
import { runResolveMutate } from "./resolve.mts";

registerHooks();

describe("runResolveMutate — user-directed human resolve", () => {
  it("forwards an other-human resolve without iterate policy routing", async () => {
    const result = await runResolveMutate({
      ...BASE_OPTS,
      resolveThreadIds: ["t-other"],
    });

    expect(mockApplyResolveOptions).toHaveBeenCalledWith(
      42,
      { owner: "owner", name: "repo" },
      expect.objectContaining({ resolveThreadIds: ["t-other"] }),
    );
    expect(result.skippedHumanResolves).toBeUndefined();
  });
});
