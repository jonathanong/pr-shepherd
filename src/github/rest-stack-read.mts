import type { RepoInfo } from "./client.mts";
import type { StackRead, StackMemberRefs } from "./stack-read.mts";
import { readRest as rest } from "./rest-reader-core.mts";
import {
  readRestPages,
  restRepoPath,
  restObject,
  restString,
  restNumber,
  restArray,
  malformedRest,
} from "./rest-reader-core.mts";
import { readRestPull, restPullRefs } from "./rest-pr-core.mts";
import { mapPool } from "../util/pool.mts";

interface RestStack {
  number: number;
  node_id: string;
  base: { ref: string };
  pull_requests: Array<{ number: number }>;
}
/** The official native-stack endpoint is authoritative; missing API access cannot prove standalone membership. */
export async function readRestStackMembership(
  anchor: number,
  repo: RepoInfo,
): Promise<RestStack | null> {
  const listed = (
    await readRestPages<RestStack>(`${restRepoPath(repo)}/stacks?pull_request=${anchor}`)
  ).nodes;
  if (listed.length === 0) return null;
  if (listed.length !== 1) malformedRest("multiple native stacks for one PR");
  const number = restNumber(listed[0]!.number, "stack number");
  const stack = restObject(
    await rest<unknown>("GET", `${restRepoPath(repo)}/stacks/${number}`),
    "stack",
  ) as unknown as RestStack;
  if (restNumber(stack.number, "stack number") !== number) malformedRest("stack identity drift");
  restString(stack.node_id, "stack node_id");
  restString(stack.base?.ref, "stack base ref");
  restArray(stack.pull_requests, "stack pull_requests");
  const numbers = stack.pull_requests.map((pull) => restNumber(pull.number, "stack member number"));
  if (!numbers.includes(anchor) || new Set(numbers).size !== numbers.length)
    malformedRest("stack membership omitted anchor or repeated member");
  return stack;
}
export async function readRestStackTopology(
  anchor: number,
  repo: RepoInfo,
): Promise<StackRead<StackMemberRefs>> {
  const stack = await readRestStackMembership(anchor, repo);
  if (!stack) throw new Error(`PR #${anchor} is not part of a native GitHub stack`);
  const ordered = await mapPool(stack.pull_requests, 4, async (pull) =>
    restPullRefs(await readRestPull(pull.number, repo)),
  );
  const verified = await readRestStackMembership(anchor, repo);
  if (!verified || JSON.stringify(verified) !== JSON.stringify(stack))
    malformedRest("native stack changed during topology read");
  return { stackNumber: stack.number, stackSize: ordered.length, ordered, viewerLogin: null };
}
