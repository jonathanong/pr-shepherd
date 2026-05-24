import { describe, it, expect } from "vitest";
import { renderResolveCommand } from "./iterate/render.mts";
import { registerIterateHooks } from "../../test-helpers/commands/iterate-test-support.mts";

registerIterateHooks();

describe("renderResolveCommand", () => {
  it("leaves thread-IDs, flag names, and plain alphanumeric args unquoted", () => {
    const joined = renderResolveCommand({
      argv: [
        "pr-shepherd",
        "resolve",
        "42",
        "--resolve-thread-ids",
        "PRRT_kwDOSGizTs58XpO6,PRRT_kwDOSGizTs58XpPD",
        "--minimize-comment-ids",
        "c-1,c-2",
      ],
      requiresHeadSha: false,
      requiresDismissMessage: false,
      hasMutations: true,
    });
    expect(joined).not.toMatch(/"/);
    expect(joined).toBe(
      "pr-shepherd resolve 42 --resolve-thread-ids PRRT_kwDOSGizTs58XpO6,PRRT_kwDOSGizTs58XpPD --minimize-comment-ids c-1,c-2",
    );
  });

  it('emits placeholders as exactly `"$PLACEHOLDER"` so callers replace the whole token', () => {
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
      requiresHeadSha: true,
      requiresDismissMessage: true,
      hasMutations: true,
    });
    // Both placeholders appear with their quotes attached as a single token —
    // this is the contract consumers rely on when doing literal-text substitution.
    expect(joined).toContain('"$DISMISS_MESSAGE"');
    expect(joined).toContain('"$HEAD_SHA"');
    expect(joined.endsWith('--require-sha "$HEAD_SHA"')).toBe(true);
  });

  it("never emits an unquoted $HEAD_SHA (regardless of requiresHeadSha)", () => {
    const withSha = renderResolveCommand({
      argv: ["pr-shepherd", "resolve", "42"],
      requiresHeadSha: true,
      requiresDismissMessage: false,
      hasMutations: false,
    });
    const withoutSha = renderResolveCommand({
      argv: ["pr-shepherd", "resolve", "42"],
      requiresHeadSha: false,
      requiresDismissMessage: false,
      hasMutations: false,
    });
    // Whenever $HEAD_SHA appears it is always quoted.
    expect(withSha).not.toMatch(/(?<!")\$HEAD_SHA(?!")/);
    expect(withoutSha).not.toContain("$HEAD_SHA");
  });

  it("never emits a backtick (would break the Markdown `resolve:` fence)", () => {
    // Rendered output is embedded inside a backtick-delimited inline span in
    // the Markdown emitter (cli.mts). An unescaped backtick here would close
    // the fence early and corrupt the rest of the line for downstream parsers.
    const rendered = renderResolveCommand({
      argv: [
        "pr-shepherd",
        "resolve",
        "42",
        "--resolve-thread-ids",
        "PRRT_kwDOSGizTs58XpO6",
        "--minimize-comment-ids",
        "c-1,c-2",
        "--dismiss-review-ids",
        "REV_1",
        "--message",
        "$DISMISS_MESSAGE",
      ],
      requiresHeadSha: true,
      requiresDismissMessage: true,
      hasMutations: true,
    });
    expect(rendered).not.toContain("`");
  });
});
