import { formatPrUrl } from "../pr-reference.mts";
import { buildPrShepherdCommand } from "../cli/runner.mts";

/** The refs a caller passed that landed in one native stack. */
export interface StackGroup {
  stack: number;
  /** PR numbers the caller listed. */
  prs: number[];
  /** Stack numbers the caller listed (at most the stack itself). */
  stackRefs: number[];
  /** Every PR in the stack. */
  members?: number[];
}

/**
 * The error for refs that span several stacks: it names each stack, the refs that belong to it,
 * and the exact command to run for it, so the caller can run them as written.
 */
export function multiStackError(
  repo: string,
  groups: StackGroup[],
  merge: "merge" | "ready" | "through" | undefined,
  through: number | undefined,
): string {
  const lines = groups.map((group) => {
    const refs = [
      ...group.stackRefs.map((n) => `stack #${n}`),
      ...group.prs.map((n) => `#${n}`),
    ].join(", ");
    const targets = [
      ...group.stackRefs.map((n) => `${repo}#${n}`),
      ...group.prs.map((n) => formatPrUrl(repo, n)),
    ];
    const flags =
      merge === "through"
        ? through !== undefined && group.members?.includes(through)
          ? ["--merge-through", formatPrUrl(repo, through)]
          : []
        : merge === "ready"
          ? ["--merge-ready"]
          : merge === "merge"
            ? ["--merge"]
            : [];
    const command = buildPrShepherdCommand([
      "stack",
      ...targets,
      "--until-terminal",
      ...flags,
    ]).text;
    return `- stack #${group.stack} (${refs}): \`${command}\``;
  });
  return [`These refs span ${groups.length} stacks. Run one command per stack:`, ...lines].join(
    "\n",
  );
}
