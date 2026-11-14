import { EXIT, ShepherdError } from "../exit-codes.mts";
import { getRepoInfo, type RepoInfo } from "../github/client.mts";
import { readRestStackByNumber, restPullExists } from "../github/rest-stack-read.mts";
import { readStackTopology } from "../github/stack-read.mts";
import {
  normalizeRepositoryIdentity,
  resolveParsedPrTarget,
  type ParsedPrReference,
} from "../pr-reference.mts";
import type { StackMergeScope } from "../types.mts";
import { multiStackError, type StackGroup } from "./stack-targets-error.mts";

export type StackMergeFlag = "merge" | "ready" | "through";

export function stackMergeScope(
  flag: StackMergeFlag | undefined,
  through: number | undefined,
): StackMergeScope | undefined {
  if (flag === "through") return { kind: "through", pr: through! };
  if (flag === "ready") return { kind: "ready" };
  return flag ? { kind: "all" } : undefined;
}

export interface StackTargetInput {
  /** One stack number, or one or more PRs from one native stack. */
  refs: ParsedPrReference[];
  /** `--merge-through`: a PR of the selected stack. */
  through?: ParsedPrReference;
  /** Which merge flag the caller passed, so a multi-stack error can repeat it. */
  merge?: StackMergeFlag;
}

export interface StackTarget {
  /** A PR of the selected stack, used to read it. */
  anchor: number;
  /** The PRs the caller owns; omitted when it owns every layer. */
  owned?: number[];
  through?: number;
  targetRepository?: RepoInfo;
}

function usage(message: string): never {
  throw new ShepherdError(message, EXIT.USAGE);
}

/**
 * Resolve `stack` refs to one native stack and the layers the caller owns. A number is a PR when
 * GitHub has one, else a stack number (the two share a sequence). One stack number or one PR owns
 * the whole stack; several PRs of one stack own only those PRs.
 */
export async function resolveStackTarget(input: StackTargetInput): Promise<StackTarget> {
  const all = [...input.refs, ...(input.through ? [input.through] : [])];
  const repos = all.flatMap((ref) => resolveParsedPrTarget(ref).targetRepository ?? []);
  const named = repos[0];
  if (
    repos.some(
      (r) =>
        normalizeRepositoryIdentity(`${r.owner}/${r.name}`) !==
        normalizeRepositoryIdentity(`${named!.owner}/${named!.name}`),
    )
  ) {
    usage("stack refs must all name one repository.");
  }
  const [only] = input.refs;
  // One PR URL needs no resolution: it selects its stack and owns every layer.
  if (input.refs.length === 1 && only!.url === true && !input.through) {
    return { anchor: only!.number!, ...(named && { targetRepository: named }) };
  }
  const repo = named ?? (await getRepoInfo());
  const slug = `${repo.owner}/${repo.name}`;
  const numbers = [...new Set(input.refs.map((ref) => ref.number!))];
  const refByNumber = new Map(input.refs.map((ref) => [ref.number!, ref]));
  const groups = new Map<number, StackGroup>();
  for (const number of numbers) {
    // A number already in a read stack is one of its PRs; PR and stack numbers never collide.
    const member = [...groups.values()].find((group) => group.members!.includes(number));
    if (member) {
      member.prs.push(number);
      continue;
    }
    const isPr = refByNumber.get(number)!.url === true || (await restPullExists(number, repo));
    const found = isPr ? await readPrStack(number, repo) : await readStack(number, repo, slug);
    const group = groups.get(found.number) ?? { stack: found.number, prs: [], stackRefs: [] };
    (isPr ? group.prs : group.stackRefs).push(number);
    groups.set(found.number, group);
    group.members = found.members;
  }
  if (groups.size > 1) {
    usage(multiStackError(slug, [...groups.values()], input.merge, input.through?.number));
  }
  const group = [...groups.values()][0]!;
  if (group.stackRefs.length > 0 && numbers.length > 1) {
    usage(
      `stack #${group.stack} is named together with other refs. A stack number already selects every layer; pass either that one stack number or PRs of the stack.`,
    );
  }
  const owned = group.prs.length > 1 ? group.prs : undefined;
  const through = input.through?.number;
  if (through !== undefined) {
    if (!group.members!.includes(through)) {
      usage(`--merge-through PR #${through} is not a layer of native stack #${group.stack}.`);
    }
    if (owned && !owned.includes(through)) {
      usage(`--merge-through PR #${through} is not one of the PRs listed as yours.`);
    }
    if (input.through!.url !== true && !(await restPullExists(through, repo))) {
      usage(`--merge-through takes a pull request; #${through} is a stack number.`);
    }
  }
  return {
    anchor: group.prs[0] ?? group.members![0]!,
    ...(owned && { owned }),
    ...(through !== undefined && { through }),
    ...(named && { targetRepository: repo }),
  };
}

async function readPrStack(pr: number, repo: RepoInfo) {
  const read = await readStackTopology(pr, repo);
  return { number: read.stackNumber, members: read.ordered.map((member) => member.number) };
}

async function readStack(number: number, repo: RepoInfo, slug: string) {
  const stack = await readRestStackByNumber(number, repo);
  if (!stack) usage(`#${number} is neither a pull request nor a native stack in ${slug}.`);
  return { number: stack.number, members: stack.members };
}
