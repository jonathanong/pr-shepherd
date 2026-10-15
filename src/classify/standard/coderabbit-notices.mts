import type { ClassifyRule } from "../types.mts";
import { isBotItem } from "./author.mts";

const NOTICE_ENVELOPE =
  /^<!-- This is an auto-generated comment: (rate limited|skip review|review in progress) by coderabbit.ai -->\n([\s\S]*?)\n<!-- end of auto-generated comment: \1 by coderabbit.ai -->$/;

const COMMAND_REPLY =
  /^<!-- This is an auto-generated reply by CodeRabbit -->\n<!-- CodeRabbit review command invocation: v2:[a-f0-9]+ -->\n<details>\n<summary>⚠️ Action not completed<\/summary>\n\n(?:Review rate limited\.|Review skipped: \d+ files exceed the limit of \d+\.)\n\n(?:> Note: CodeRabbit is an incremental review system and does not re-review already reviewed commits\. This command is applicable only when automatic reviews are paused\.|---\n\nYour included review limit is currently reached under our \[Fair Usage Limits Policy\]\(https:\/\/docs.coderabbit.ai\/management\/plans#fair-usage-limits-policy\)\. This review may still proceed through usage-based billing if eligible\. Your next included review will be available in \d+ minutes?\.)\n\n<\/details>$/;

/** Strips CodeRabbit's footer and header blocks so only the notice envelope remains. */
function stripChrome(body: string): string {
  return body
    .trim()
    .replace(/\n<!-- tips_start -->[\s\S]*?<!-- tips_end -->$/, "")
    .trim()
    .replace(/\n<!-- autopilot:start -->[\s\S]*?<!-- autopilot:end -->$/, "")
    .trim()
    .replace(/^<!-- This is an auto-generated comment: summarize by coderabbit.ai -->\s*/, "")
    .replace(/^<!-- review_stack_entry_start -->[\s\S]*?<!-- review_stack_entry_end -->\s*/, "");
}

function isQuotedNotice(quoted: string): boolean {
  const onlyQuotedLines = quoted.split("\n").every((line) => !line.trim() || line.startsWith(">"));
  if (!onlyQuotedLines) return false;
  return (
    quoted.includes("> ## Review limit reached\n") ||
    quoted.includes("> ## Draft PR not reviewed\n") ||
    quoted.includes("> ## Review skipped\n") ||
    quoted.includes(
      "> Currently processing new changes in this PR. This may take a few minutes, please wait...",
    )
  );
}

/**
 * CodeRabbit progress, rate-limit, review-skipped and draft notices, plus its "Action not
 * completed" command replies. If the comment is later edited into a PR walkthrough, its new
 * body no longer matches and Shepherd surfaces the edited minimized comment to the agent.
 */
const rule: ClassifyRule = (item) => {
  if (!isBotItem(item, ["coderabbitai"], ["pr-comment"])) return null;
  const body = stripChrome(item.body);
  const quoted = body.match(NOTICE_ENVELOPE)?.[2]?.trim();
  if (!(quoted && isQuotedNotice(quoted)) && !COMMAND_REPLY.test(body)) return null;
  return {
    autoResolve: true,
    suppress: true,
    reason: "CodeRabbit progress, review-limit, or skipped-review notice",
  };
};

export default rule;
