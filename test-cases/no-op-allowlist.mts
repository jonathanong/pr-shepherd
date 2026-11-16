/**
 * Cases where repeating the same `triage` after a no-op tick is accepted. Pattern matches the
 * fixture directory name or generated case name. A listed case must still repeat (a fix removes
 * its entry).
 */
const BRANCH =
  "the caller must update the branch (rebase/merge/retarget), a git action only it can take; docs/actions.md: an unchanged conflict escalates through stall-timeout";

export const NO_OP_ALLOWLIST: Array<{ match: RegExp; why: string }> = [
  {
    match: /^(117|127|129|172|173|174|176|179|180|197|27|28|39|49|50|51|52|63|74)-/,
    why: BRANCH,
  },
  {
    match: /^85-/,
    why: "the caller must run the printed stack merge handoff; Shepherd cannot merge itself",
  },
];

export function allowlistReason(name: string): string | undefined {
  return NO_OP_ALLOWLIST.find((entry) => entry.match.test(name))?.why;
}
