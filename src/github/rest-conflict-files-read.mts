import type { RepoInfo } from "./client.mts";
import { readRest, restArray, restObject, restRepoPath, restString } from "./rest-reader-core.mts";

interface SideFile {
  filename: string;
  /** Set when this side renamed the file. */
  previous?: string;
}

function compareFiles(files: unknown[]): SideFile[] {
  return files.map((value) => {
    const file = restObject(value, "compare file");
    const filename = restString(file.filename, "compare file name");
    return typeof file.previous_filename === "string"
      ? { filename, previous: file.previous_filename }
      : { filename };
  });
}

/**
 * Compare lists `files` on its first page only (later pages carry commits), and at most 300 of
 * them, so a very large change can yield an incomplete list. One commit per page keeps it small.
 */
async function readSide(
  repo: RepoInfo,
  basehead: string,
): Promise<{ files: SideFile[]; body: Record<string, unknown> }> {
  const body = restObject(
    await readRest<unknown>("GET", `${restRepoPath(repo)}/compare/${basehead}?per_page=1`),
    "compare",
  );
  return { files: compareFiles(restArray(body.files, "compare files")), body };
}

/**
 * Files changed by the PR head and by the base branch since their merge base. GitHub exposes
 * no list of conflicting files, so this intersection is raw evidence of where a conflict can be.
 * Read through REST on both transports: GraphQL has no per-file compare.
 */
export async function readRestFilesChangedOnBothSides(
  repo: RepoInfo,
  baseRef: string,
  headRef: string,
): Promise<string[]> {
  const { files: head, body } = await readSide(
    repo,
    `${encodeURIComponent(baseRef)}...${encodeURIComponent(headRef)}`,
  );
  const mergeBase = restString(
    restObject(body.merge_base_commit, "compare merge base").sha,
    "compare merge base SHA",
  );
  const { files: base } = await readSide(repo, `${mergeBase}...${encodeURIComponent(baseRef)}`);
  // A rename on either side still matches through the name the other side changed.
  const baseNames = new Set(
    base.flatMap((file) => [file.filename, file.previous ?? file.filename]),
  );
  return head
    .filter((file) => baseNames.has(file.filename) || baseNames.has(file.previous ?? file.filename))
    .map((file) => file.filename);
}
