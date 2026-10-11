import { describe, it, expect } from "vitest";
import {
  registerHooks,
  getStdout,
  mockRunResolveMutate,
} from "../test-helpers/cli-parser.test-support.mts";
import { main } from "./cli-parser.mts";
import { EXIT } from "./exit-codes.mts";

registerHooks();

describe("apply review session refusals", () => {
  it.each(["text", "json"] as const)(
    "prints partial review results and exits NOPERM in %s format after a session refusal",
    async (format) => {
      const refusal =
        "GitHub access to this repository is not enabled for this session. Call add_repo.";
      mockRunResolveMutate.mockResolvedValue({
        repliedThreads: ["thread-1"],
        resolvedThreads: [],
        minimizedComments: [],
        dismissedReviews: [],
        errors: [],
        sessionRefusal: refusal,
        instructions: [
          "Restore GitHub access for this session using the proxy instructions above.",
          "Retry only the pending IDs listed above.",
        ],
        unrepliedThreads: ["thread-2"],
      });

      await main([
        "node",
        "shepherd",
        "apply",
        "review",
        "42",
        "--reply-thread-ids",
        "thread-1,thread-2",
        "--message",
        "Fixed.",
        ...(format === "json" ? ["--format", "json"] : []),
      ]);

      expect(process.exitCode).toBe(EXIT.NOPERM);
      const out = getStdout();
      if (format === "json") {
        expect(JSON.parse(out)).toMatchObject({
          sessionRefusal: refusal,
          instructions: [
            "Restore GitHub access for this session using the proxy instructions above.",
            "Retry only the pending IDs listed above.",
          ],
          repliedThreads: ["thread-1"],
          unrepliedThreads: ["thread-2"],
        });
      } else {
        expect(out).toContain("Replied to threads: thread-1");
        expect(out).toContain("Stopped: GitHub session access refused");
        expect(out).toContain("Not replied due to session access: thread-2");
        expect(out).toContain("Retry only the pending IDs listed above.");
      }
    },
  );
});
