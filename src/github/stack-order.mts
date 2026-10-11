import { EXIT, ShepherdError } from "../exit-codes.mts";
import type { StackMemberRefs } from "./stack-read.mts";

/** Bottom-to-top members, or an error unless every member and the anchor were observed. */
export function orderedStackMembers<Pr extends StackMemberRefs>(
  entries: ReadonlyArray<{ position: number; pullRequest: Pr }>,
  anchor: number,
  stackSize: number,
): Pr[] {
  const unique = new Map<number, { position: number; pullRequest: Pr }>();
  for (const entry of entries) unique.set(entry.pullRequest.number, entry);
  if (!unique.has(anchor) || unique.size !== stackSize) {
    throw new ShepherdError(
      `GitHub returned incomplete stack membership (${unique.size} of ${stackSize} entries)`,
      EXIT.TEMPFAIL,
    );
  }
  return [...unique.values()]
    .sort((left, right) => left.position - right.position)
    .map((entry) => entry.pullRequest);
}
