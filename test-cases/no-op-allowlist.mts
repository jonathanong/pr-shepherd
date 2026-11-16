/**
 * Cases where repeating the same `triage` after a no-op tick is accepted. Pattern matches the
 * fixture directory name or generated case name. A listed case must still repeat (a fix removes
 * its entry).
 */
const BRANCH =
  "the caller must update the branch (rebase/merge/retarget), a git action only it can take; docs/actions.md: an unchanged conflict escalates through stall-timeout";
const EXTERNAL_ISSUE =
  "failing external check with a URL stays TRIAGE by design (docs/actions.md); loop-until-stall-timeout is tracked in #753";
const EXCERPT_ISSUE =
  "log excerpt without a rerun is investigation work by design (CI failure triage playbook); loop-until-stall-timeout is tracked in #753";

export const NO_OP_ALLOWLIST: Array<{ match: RegExp; why: string }> = [
  {
    match: /^(117|127|129|172|173|174|176|179|180|197|27|28|39|49|50|51|52|63|74)-/,
    why: BRANCH,
  },
  {
    match: /^85-/,
    why: "the caller must run the printed stack merge handoff; Shepherd cannot merge itself",
  },
  {
    match:
      /^(12-triage-failing-check-external|42-triage-check-annotations|43-triage-check-annotations-seen-marker|53-|55-)/,
    why: EXTERNAL_ISSUE,
  },
  { match: /^external-status\|ci-done\|/, why: EXTERNAL_ISSUE },
  { match: /^(118|119|120|122)-/, why: EXCERPT_ISSUE },
  { match: /^FAILURE\+excerpt\|merge_group\|[^|]*\|[^|]*\|not-queued$/, why: EXCERPT_ISSUE },
  { match: /^FAILURE\+excerpt\|pr\|attempt-2\|run-completed\|/, why: EXCERPT_ISSUE },
];

export function allowlistReason(name: string): string | undefined {
  return NO_OP_ALLOWLIST.find((entry) => entry.match.test(name))?.why;
}
