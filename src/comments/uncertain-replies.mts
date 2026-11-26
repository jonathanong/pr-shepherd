import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { mkdir, writeFile } from "../state/guarded-fs.mts";
import { dirname } from "node:path";
import { resolvePrStatePath } from "../state/base.mts";
import { resolveRestThreadRoot } from "../github/rest-identities.mts";
import type { RepoInfo } from "../github/client.mts";
import { readReplyRecoveryEvidence, type ReplyEvidence } from "../github/reply-recovery-read.mts";
import { addPrShepherdMarker } from "./marker.mts";
import { prepareUnmappedIntents, rememberUnmappedIntent } from "./uncertain-reply-guards.mts";

interface ReplyContext {
  repo: RepoInfo;
  pr: number;
}
const adoptedReplies = new WeakMap<object, readonly string[]>();
export function trackAdoptedReplyThreads(result: object, ids: readonly string[]): void {
  adoptedReplies.set(result, ids);
}
export function adoptedReplyThreads(result: object): readonly string[] {
  return adoptedReplies.get(result) ?? [];
}

async function paths(context: ReplyContext, id: string, message: string): Promise<string[]> {
  const identities = [id];
  try {
    identities.push(`rest-thread-${await resolveRestThreadRoot(context.repo, context.pr, id)}`);
  } catch {}
  return [...new Set(identities)].map((identity) =>
    resolvePrStatePath(
      { owner: context.repo.owner, repo: context.repo.name, pr: context.pr },
      "uncertain-replies",
      `${createHash("sha256").update(`${identity}\n${message}`).digest("hex")}.json`,
    ),
  );
}

function uncertainMessage(undecided: { id: string; command: string }[]): string {
  return (
    `Previous GraphQL reply outcome is uncertain for ${undecided.length} thread(s): ${undecided.map((item) => item.id).join(", ")}; no duplicate reply was sent.\n` +
    "1. Inspect each complete thread transcript and verify whether the previous reply was delivered. If it was, rerun the same generated command with `--adopt-existing-replies`.\n" +
    "2. For each thread you verified was not delivered, with no request still in flight, clear only that thread's markers:\n" +
    undecided.map((item) => `   ${item.command}`).join("\n") +
    "\n3. Rerun the original reply command; do not clear all PR state or change the disposition to bypass this check."
  );
}

export async function assertReplyOutcomeKnown(
  context: ReplyContext,
  ids: string[],
  message: string,
): Promise<string[]> {
  await prepareUnmappedIntents(context, ids, message, paths);
  const pending = new Map<
    string,
    {
      paths: string[];
      record: {
        id: string;
        message: string;
        viewer?: string;
        beforeIds?: string[];
        adoptedCommentId?: string;
      };
    }
  >();
  for (const id of ids) {
    const present: string[] = [];
    let record:
      | {
          id: string;
          message: string;
          viewer?: string;
          beforeIds?: string[];
          adoptedCommentId?: string;
        }
      | undefined;
    for (const path of await paths(context, id, message)) {
      try {
        const raw = await readFile(path, "utf8");
        present.push(path);
        const parsed = JSON.parse(raw) as typeof record;
        if (parsed && typeof parsed.id === "string" && typeof parsed.message === "string")
          record = parsed;
      } catch (error) {
        if (error instanceof SyntaxError) continue;
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    if (present.length) pending.set(id, { paths: present, record: record ?? { id, message } });
  }
  const adopted: string[] = [];
  const pendingIds = [...pending.keys()].filter((id) => {
    const record = pending.get(id)!.record;
    if (
      typeof record.adoptedCommentId === "string" &&
      record.adoptedCommentId &&
      record.message === message
    ) {
      adopted.push(id);
      return false;
    }
    return true;
  });
  const undecided: { id: string; command: string }[] = [];
  for (let offset = 0; offset < pendingIds.length; offset += 10) {
    let evidence = new Map<string, ReplyEvidence>();
    try {
      evidence = await readReplyRecoveryEvidence(
        context.repo,
        context.pr,
        pendingIds.slice(offset, offset + 10),
      );
    } catch {
      /* Failed reads cannot authorize a duplicate reply. */
    }
    for (const id of pendingIds.slice(offset, offset + 10)) {
      const item = pending.get(id)!;
      const current = evidence.get(id);
      const record = item.record;
      const before = new Set(Array.isArray(record.beforeIds) ? record.beforeIds : []);
      const matches =
        record.id &&
        record.message === message &&
        typeof record.viewer === "string" &&
        record.viewer &&
        Array.isArray(record.beforeIds) &&
        record.beforeIds.every((value) => typeof value === "string") &&
        current?.viewer.toLowerCase() === record.viewer.toLowerCase()
          ? current.comments.filter(
              (comment) =>
                !before.has(comment.id) &&
                comment.body === addPrShepherdMarker(message) &&
                comment.author?.toLowerCase() === record.viewer!.toLowerCase(),
            )
          : [];
      if (matches.length !== 1) {
        const recoveryPaths = [
          ...new Set([...item.paths, ...(await paths(context, record.id, message))]),
        ];
        const command = `rm -- ${recoveryPaths.map((path) => `'${path.replaceAll("'", "'\\''")}'`).join(" ")}`;
        undecided.push({ id, command });
        continue;
      }
      // Keep confirmed outcomes durable: another pending ID or a later resolve can still fail.
      const outcomePaths = new Set([...item.paths, ...(await paths(context, record.id, message))]);
      for (const path of outcomePaths)
        await writeFile(path, JSON.stringify({ ...record, adoptedCommentId: matches[0]!.id }));
      adopted.push(id);
    }
  }
  if (undecided.length) throw new Error(uncertainMessage(undecided));
  await prepareUnmappedIntents(context, ids, message, paths);
  return adopted;
}

export async function rememberUncertainReplies(
  context: ReplyContext,
  ids: string[],
  message: string,
  evidence = new Map<string, ReplyEvidence>(),
): Promise<void> {
  for (const id of ids) {
    for (const path of await paths(context, id, message)) {
      await mkdir(dirname(path), { recursive: true });
      const baseline = evidence.get(id);
      await writeFile(
        path,
        JSON.stringify({
          id,
          message,
          recordedAt: Date.now(),
          ...(baseline && {
            viewer: baseline.viewer,
            beforeIds: baseline.comments.map((comment) => comment.id),
          }),
        }),
      );
    }
    await rememberUnmappedIntent(context, id, message);
  }
}
