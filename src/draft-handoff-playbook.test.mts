import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rootUrl = new URL("../", import.meta.url);

describe("draft handoff playbook", () => {
  const playbook = readFileSync(
    new URL("plugins/pr-shepherd/skills/pr-shepherd/references/draft-handoff.md", rootUrl),
    "utf8",
  );

  it("names the raw fields, the report line set, and the skills page", () => {
    expect(playbook).toContain("# Draft handoff");
    for (const field of [
      "isDraft",
      "autoMergeRequest",
      "state",
      "stack object",
      "allow_auto_merge",
    ]) {
      expect(playbook).toContain(field);
    }
    expect(playbook).toContain("repository auto-merge setting");
    expect(playbook).toContain(
      "gh pr view <number> --repo <owner/repo> --json isDraft,autoMergeRequest,state,headRefOid",
    );
    expect(playbook).toContain("missing or unreadable `stack` field");
    expect(playbook).toContain("manual-verification-required");
    expect(playbook).toContain("MERGED");
    expect(playbook).toContain("`--merge` argument is the arm flag");
    expect(playbook).toContain("enablePullRequestAutoMerge");
    expect(playbook).toContain("Do not run `gh pr merge`");
    expect(playbook).toContain("allow_merge_commit");
    expect(playbook).toContain("immediate checkpoint once");
    expect(playbook).toMatch(/in-session `pr-shepherd` loop/);
    expect(readFileSync(new URL("docs/skills.md", rootUrl), "utf8")).toContain(
      "`draft-handoff.md`",
    );
  });
});
