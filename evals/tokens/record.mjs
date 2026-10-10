#!/usr/bin/env node
// Re-records the real GitHub data under evals/tokens/data/. bench.mjs never
// touches the network. It reads only what this script wrote, so the report is
// deterministic and CI can regenerate it.
//
// Usage:
//   node evals/tokens/record.mjs --mcp-server <path to a github/github-mcp-server checkout>
//
// Needs an authenticated `gh` with REST access to public repositories. The
// GitHub MCP server checkout only has to contain pkg/github/__toolsnaps__,
// which is the server's own snapshot of every tool definition it sends to a
// model.
//
// Sources (all public):
//   - jonathanong/pr-shepherd#505: a PR with three bot reviewers, two resolved
//     threads and 28 KB of bot issue comments. It provides the "review history"
//     a baseline agent re-reads on every tick after the first review round.
//   - Actions job 110714612462 (run 36967599241): a real `npm run test:coverage`
//     failure. It provides the CI log both arms triage.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, MCP_TOOLS_USED, repinMcpApiMap } from "./lib.mjs";

const REPO = "jonathanong/pr-shepherd";
const HISTORY_PR = 505;
const JOB_ID = 110714612462;

// The GitHub MCP tools a Claude Code cloud session exposed on 2026-10-10.
const EAGER_TOOLSET = `actions_get actions_list actions_run_trigger add_comment_to_pending_review
add_issue_comment add_reply_to_pull_request_comment create_branch create_or_update_file
create_pull_request create_repository delete_file disable_pr_auto_merge enable_pr_auto_merge
fork_repository get_check_run get_commit get_file_contents get_job_logs get_label
get_latest_release get_me get_release_by_tag get_tag get_team_members get_teams issue_read
issue_write list_branches list_commits list_issue_fields list_issue_types list_issues
list_pull_requests list_releases list_repository_collaborators list_tags merge_pull_request
pull_request_read pull_request_review_write push_files request_copilot_review
resolve_review_thread run_secret_scanning search_code search_commits search_issues
search_pull_requests search_repositories search_users sub_issue_write unresolve_review_thread
update_issue_comment update_pull_request update_pull_request_branch`.split(/\s+/);

const gh = (path) => execFileSync("gh", ["api", path], { encoding: "utf8", maxBuffer: 64 << 20 });
const ghJson = (path) => JSON.parse(gh(path));

/**
 * Review threads as `{ path, line, resolved, outdated, comment_ids }`. GraphQL
 * is the normal transport and has real thread objects, so it comes first. The
 * REST-only `ccr/review_threads` route is the fallback for a token or network
 * that cannot reach GraphQL (the Claude Code remote 403, for one).
 *
 * The GraphQL path is not exercised by CI or by the author's sandbox, which has
 * no GitHub access; it is unverified until record.mjs is next run live.
 */
function recordThreads() {
  const [owner, name] = REPO.split("/");
  // fullDatabaseId, not databaseId: review-comment IDs now exceed Int32, where
  // the legacy databaseId is null.
  const query = `query { repository(owner: "${owner}", name: "${name}") { pullRequest(number: ${HISTORY_PR}) { reviewThreads(first: 100) { nodes { path line isResolved isOutdated comments(first: 100) { nodes { fullDatabaseId } } } } } } }`;
  try {
    const out = JSON.parse(
      execFileSync("gh", ["api", "graphql", "-f", `query=${query}`], {
        encoding: "utf8",
        maxBuffer: 64 << 20,
      }),
    );
    const threads = out.data.repository.pullRequest.reviewThreads.nodes.map((t) => ({
      path: t.path,
      line: t.line,
      resolved: t.isResolved,
      outdated: t.isOutdated,
      comment_ids: t.comments.nodes.map((c) => c.fullDatabaseId),
    }));
    if (threads.some((t) => t.comment_ids.some((id) => id === null || id === undefined))) {
      throw new Error("a review comment has no fullDatabaseId");
    }
    return threads;
  } catch (error) {
    console.error(`GraphQL review threads failed (${error.message.split("\n")[0]}); using REST`);
    // REST has no thread objects; this route groups comment IDs by thread.
    return ghJson(`repos/${REPO}/pulls/${HISTORY_PR}/ccr/review_threads`);
  }
}

function recordHistory() {
  const base = `repos/${REPO}`;
  const reviewComments = ghJson(`${base}/pulls/${HISTORY_PR}/comments?per_page=100`);
  const issueComments = ghJson(`${base}/issues/${HISTORY_PR}/comments?per_page=100`);
  const reviews = ghJson(`${base}/pulls/${HISTORY_PR}/reviews?per_page=100`);
  const threads = recordThreads();

  const pull = ghJson(`${base}/pulls/${HISTORY_PR}`);
  // GraphQL's BigInt fullDatabaseId arrives as a string, REST's id as a number.
  const byId = new Map(reviewComments.map((c) => [String(c.id), c]));
  const comment = (c) => ({
    id: c.id,
    author: c.user.login,
    body: c.body,
    url: c.html_url,
    createdAt: c.created_at,
  });
  const history = {
    source: `https://github.com/${REPO}/pull/${HISTORY_PR}`,
    prTitle: pull.title,
    prBody: pull.body,
    reviewThreads: threads.map((t) => ({
      path: t.path,
      line: t.line,
      isResolved: t.resolved,
      isOutdated: t.outdated,
      comments: t.comment_ids.map((id) => comment(byId.get(String(id)))),
    })),
    comments: issueComments.map(comment),
    reviews: reviews.map((r) => ({
      id: r.id,
      author: r.user.login,
      state: r.state,
      body: r.body,
      url: r.html_url,
      submittedAt: r.submitted_at,
      commit: r.commit_id,
    })),
  };
  writeFileSync(join(DATA_DIR, "history-pr505.json"), `${JSON.stringify(history, null, 2)}\n`);
}

function recordJobLog() {
  const log = gh(`repos/${REPO}/actions/jobs/${JOB_ID}/logs`);
  writeFileSync(join(DATA_DIR, `job-${JOB_ID}.txt`), log);
  const jobs = ghJson(`repos/${REPO}/actions/jobs/${JOB_ID}`);
  const steps = jobs.steps.map((s) => ({
    number: s.number,
    name: s.name,
    conclusion: s.conclusion,
  }));
  writeFileSync(
    join(DATA_DIR, `job-${JOB_ID}.steps.json`),
    `${JSON.stringify({ runId: jobs.run_id, name: jobs.name, steps }, null, 2)}\n`,
  );
}

function recordMcpSchemas(serverDir) {
  const snaps = join(serverDir, "pkg", "github", "__toolsnaps__");
  const commit = execFileSync("git", ["-C", serverDir, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const tools = {};
  for (const name of MCP_TOOLS_USED) {
    // A model sees name, description and input schema. The snapshot's
    // annotations and outputSchema stay client-side, so they are dropped.
    const snap = JSON.parse(readFileSync(join(snaps, `${name}.snap`), "utf8"));
    tools[name] = JSON.stringify({
      name: snap.name,
      description: snap.description,
      input_schema: snap.inputSchema,
    });
  }
  // Total size when a host loads the whole GitHub toolset up front instead of
  // on demand. Missing snapshots are tools the server has since renamed.
  let eagerChars = 0;
  let eagerToolCount = 0;
  for (const name of EAGER_TOOLSET) {
    const path = join(snaps, `${name}.snap`);
    if (!existsSync(path)) continue;
    eagerToolCount++;
    const snap = JSON.parse(readFileSync(path, "utf8"));
    eagerChars += JSON.stringify({
      name: snap.name,
      description: snap.description,
      input_schema: snap.inputSchema,
    }).length;
  }
  writeFileSync(
    join(DATA_DIR, "mcp-tool-schemas.json"),
    `${JSON.stringify(
      {
        source: `github/github-mcp-server@${commit}`,
        eagerToolCount,
        eagerChars,
        tools,
      },
      null,
      2,
    )}\n`,
  );
  // The rate-limit mapping is hand-written, not recorded. Check it still names
  // tools the server has, and stamp the commit it was last compared against.
  const mapPath = join(DATA_DIR, "mcp-api-map.json");
  const map = JSON.parse(readFileSync(mapPath, "utf8"));
  const missing = Object.keys(map.tools)
    .map((k) => k.split(":")[0])
    .filter((t) => !existsSync(join(snaps, `${t}.snap`)));
  if (missing.length) console.error(`mcp-api-map.json names tools the server lacks: ${missing}`);
  repinMcpApiMap(map, `github/github-mcp-server@${commit}`);
  writeFileSync(mapPath, `${JSON.stringify(map, null, 2)}\n`);
}

const i = process.argv.indexOf("--mcp-server");
if (i < 0 || !process.argv[i + 1]) {
  console.error("usage: node evals/tokens/record.mjs --mcp-server <github-mcp-server checkout>");
  process.exit(2);
}
recordHistory();
recordJobLog();
recordMcpSchemas(process.argv[i + 1]);
console.log(`recorded into ${DATA_DIR}`);
