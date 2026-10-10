import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveStateBase } from "../state/base.mts";
import type { SeenMarker } from "../state/seen-comments.mts";
import type { RepoInfo } from "./client.mts";
import type { FixAttemptsState } from "../state/fix-attempts.mts";

type IdentityKind = "check" | "review" | "comment" | "pull" | "thread";

interface RestIdentity {
  repo: RepoInfo;
  pr: number;
  numericId: string;
  kind: IdentityKind;
  graphqlThreadId?: string;
}

function identityPath(id: string): string {
  const hash = createHash("sha256").update(id).digest("hex");
  return join(resolveStateBase(), "github-identities", `${hash}.json`);
}

function numeric(value: string | number): string {
  const result = String(value);
  if (!/^[1-9][0-9]*$/.test(result)) throw new Error(`Invalid GitHub numeric ID: ${result}`);
  return result;
}

export function restThreadId(rootCommentId: string | number): string {
  return `rest-thread-${numeric(rootCommentId)}`;
}

async function storeIdentity(id: string, entry: RestIdentity): Promise<void> {
  await mkdir(join(resolveStateBase(), "github-identities"), { recursive: true });
  await writeFile(identityPath(id), JSON.stringify({ id, ...entry }));
}

export async function recordRestIdentity(
  repo: RepoInfo,
  pr: number,
  nodeId: string,
  numericId: string | number,
  kind: IdentityKind,
): Promise<void> {
  if (!nodeId) return;
  await storeIdentity(nodeId, { repo, pr, numericId: numeric(numericId), kind });
}

export async function resolveRestIdentity(id: string, kind?: IdentityKind): Promise<RestIdentity> {
  let entry: RestIdentity & { id: string };
  try {
    entry = JSON.parse(await readFile(identityPath(id), "utf8")) as typeof entry;
  } catch {
    throw new Error(
      `No recorded REST identity for ${id}; refresh this PR with REST transport first`,
    );
  }
  if (
    entry.id !== id ||
    !entry.repo?.owner ||
    !entry.repo.name ||
    !Number.isSafeInteger(entry.pr) ||
    entry.pr < (entry.kind === "check" ? 0 : 1) ||
    !/^[1-9][0-9]*$/.test(entry.numericId) ||
    (kind !== undefined && entry.kind !== kind)
  )
    throw new Error(`Invalid REST identity for ${id}`);
  return entry;
}

export async function recordThreadIdentity(
  repo: RepoInfo,
  pr: number,
  graphqlThreadId: string,
  rootCommentId: string | number,
): Promise<void> {
  const numericId = numeric(rootCommentId);
  const canonical = restThreadId(numericId);
  let existing: RestIdentity | undefined;
  try {
    existing = await resolveRestIdentity(canonical, "thread");
  } catch {}
  const genuineId = graphqlThreadId.startsWith("rest-thread-")
    ? existing?.graphqlThreadId
    : graphqlThreadId;
  const entry: RestIdentity = {
    repo,
    pr,
    numericId,
    kind: "thread",
    ...(genuineId && { graphqlThreadId: genuineId }),
  };
  if (genuineId) await storeIdentity(genuineId, entry);
  await storeIdentity(canonical, entry);
}

function samePr(entry: RestIdentity, repo: RepoInfo, pr: number): boolean {
  return (
    entry.pr === pr &&
    entry.repo.owner.toLowerCase() === repo.owner.toLowerCase() &&
    entry.repo.name.toLowerCase() === repo.name.toLowerCase()
  );
}

export async function resolveRestThreadRoot(
  repo: RepoInfo,
  pr: number,
  id: string,
): Promise<string> {
  const match = /^rest-thread-([1-9][0-9]*)$/.exec(id);
  if (match) return match[1]!;
  const entry = await resolveRestIdentity(id, "thread");
  if (!samePr(entry, repo, pr))
    throw new Error(`Thread ${id} does not belong to ${repo.owner}/${repo.name}#${pr}`);
  return entry.numericId;
}

export async function resolveGraphqlThreadId(id: string): Promise<string> {
  if (!id.startsWith("rest-thread-")) return id;
  const entry = await resolveRestIdentity(id, "thread");
  if (!entry.graphqlThreadId)
    throw new Error(`No GraphQL thread identity for ${id}; use --transport rest`);
  return entry.graphqlThreadId;
}

/** Preserve previously displayed feedback when the adapter changes its thread handle. */
export async function aliasThreadSeenMarkers(
  repo: RepoInfo,
  pr: number,
  ids: readonly string[],
  seen: Map<string, SeenMarker>,
): Promise<void> {
  await Promise.all(
    ids.map(async (id) => {
      try {
        const entry = await resolveRestIdentity(id, "thread");
        if (!samePr(entry, repo, pr)) return;
        const aliases = [id, restThreadId(entry.numericId), entry.graphqlThreadId].filter(
          (alias): alias is string => alias !== undefined,
        );
        const marker = aliases
          .map((alias) => seen.get(alias))
          .find((candidate) => candidate !== undefined);
        if (marker) for (const alias of aliases) if (!seen.has(alias)) seen.set(alias, marker);
      } catch {
        // Old snapshots may have no association. Surface again rather than hide an unseen item.
      }
    }),
  );
}

/** Keep fix-attempt counts tied to the same feedback when its transport handle changes. */
export async function aliasThreadFixAttempts(
  repo: RepoInfo,
  pr: number,
  ids: readonly string[],
  state: FixAttemptsState | null,
): Promise<void> {
  if (!state?.threadBodyHashes) return;
  await Promise.all(
    ids.map(async (id) => {
      try {
        const entry = await resolveRestIdentity(id, "thread");
        if (!samePr(entry, repo, pr)) return;
        const aliases = [id, restThreadId(entry.numericId), entry.graphqlThreadId].filter(
          (alias): alias is string => alias !== undefined,
        );
        const source = aliases.find((alias) => state.threadBodyHashes?.[alias] !== undefined);
        if (!source) return;
        const bodyHash = state.threadBodyHashes![source]!;
        const attempts = Math.max(
          ...aliases
            .filter((alias) => state.threadBodyHashes?.[alias] === bodyHash)
            .map((alias) => state.threadAttempts[alias] ?? 0),
        );
        state.threadBodyHashes![id] = bodyHash;
        state.threadAttempts[id] = attempts;
      } catch {
        /* Unmapped older handles retain their ordinary first-look behavior. */
      }
    }),
  );
}
