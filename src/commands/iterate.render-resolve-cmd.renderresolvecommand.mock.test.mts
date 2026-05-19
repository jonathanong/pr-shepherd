import { describe, it, expect } from "vitest";
import { renderResolveCommand } from "./iterate/render.mts";
import { registerIterateHooks } from "./iterate-test-support.mts";

registerIterateHooks();

describe("renderResolveCommand", () => {
  it("quotes $DISMISS_MESSAGE so a substituted sentence stays one argument", () => {
    const joined = renderResolveCommand({
      argv: [
        "pr-shepherd",
        "resolve",
        "42",
        "--dismiss-review-ids",
        "r-1",
        "--message",
        "$DISMISS_MESSAGE",
      ],
      requiresHeadSha: false,
      requiresDismissMessage: true,
      hasMutations: true,
    });
    expect(joined).toBe(
      'pr-shepherd resolve 42 --dismiss-review-ids r-1 --message "$DISMISS_MESSAGE"',
    );
  });
  it('appends --require-sha "$HEAD_SHA" when requiresHeadSha is true', () => {
    const joined = renderResolveCommand({
      argv: ["pr-shepherd", "resolve", "42", "--resolve-thread-ids", "t-1"],
      requiresHeadSha: true,
      requiresDismissMessage: false,
      hasMutations: true,
    });
    expect(joined).toBe(
      'pr-shepherd resolve 42 --resolve-thread-ids t-1 --require-sha "$HEAD_SHA"',
    );
  });
  it("omits --require-sha when requiresHeadSha is false (noise-only path)", () => {
    const joined = renderResolveCommand({
      argv: ["pr-shepherd", "resolve", "42", "--minimize-comment-ids", "c-noise"],
      requiresHeadSha: false,
      requiresDismissMessage: false,
      hasMutations: true,
    });
    expect(joined).toBe("pr-shepherd resolve 42 --minimize-comment-ids c-noise");
  });
  it("quotes whitespace-bearing args defensively", () => {
    const joined = renderResolveCommand({
      argv: ["pr-shepherd", "resolve", "42", "--message", "hello world"],
      requiresHeadSha: false,
      requiresDismissMessage: false,
      hasMutations: false,
    });
    expect(joined).toBe('pr-shepherd resolve 42 --message "hello world"');
  });
});
