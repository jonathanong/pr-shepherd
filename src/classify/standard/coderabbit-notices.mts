import type { ClassifyRule } from "../types.mts";
import { isBotItem } from "./author.mts";

const NOTICE_ENVELOPE =
  /^<!-- This is an auto-generated comment: (rate limited|skip review|review in progress) by coderabbit.ai -->\n([\s\S]*?)\n<!-- end of auto-generated comment: \1 by coderabbit.ai -->$/;

/**
 * Command replies that only report a known status, optionally followed by one of CodeRabbit's
 * fixed explanations. The invocation id varies between releases; any other text stays visible.
 */
const COMMAND_REPLY =
  /^<!-- This is an auto-generated reply by CodeRabbit -->\n<!-- CodeRabbit review command invocation: [^\n]* -->\n<details>\n<summary>(?:⚠️ Action not completed|✅ Action performed)<\/summary>\n\n(?:Review rate limited\.|Review skipped: \d+ files exceed the limit of \d+\.|(?:Full review|Review) finished\.|Pull request base or head changed\.|Pull request is closed\.)\n\n(?:(?:> Note: CodeRabbit is an incremental review system and does not re-review already reviewed commits\. This command is applicable only when automatic reviews are paused\.|---\n\nYour included review limit is currently reached under our \[Fair Usage Limits Policy\]\(https:\/\/docs\.coderabbit\.ai\/[^\s)]*\)\. This review may still proceed through usage-based billing if eligible\. Your next included review will be available in \d+ minutes?\.)\n\n)?<\/details>$/;

/** Standalone status comments: zero-findings completion, skipped autofix, and a failed edit. */
const STATUS_COMMENTS = [
  /^<!-- coderabbit-review-completion-marker -->\n\*\*Actionable comments posted: 0\*\*$/,
  /^<!-- This is an auto-generated comment: autofix status by CodeRabbit -->\n> \[!NOTE\]\n> Autofix is a beta feature\.[^\n]*\n\nAutofix skipped\. No unresolved CodeRabbit review comments with fix instructions found\.\n<!-- autofix-run-id: [^\n]* -->$/,
  /^> \[!CAUTION\]\n> Failed to replace \(edit\) comment\. This is likely due to insufficient permissions or the comment being deleted\.\n> \n> <details>\n> <summary>Error details<\/summary>\n> \n> ```\n> [^`\n]*\n> ```\n> \n> <\/details>$/,
];

/** One "Finishing Touches" option group: a bold title and only checkbox lines with plain labels. */
const FINISHING_TOUCH_GROUP =
  "<details open>\\n<summary><strong>[^<\\n]+<\\/strong><\\/summary>\\n<dl>\\n<dd>\\n\\n(?:- \\[ \\] <!-- \\{[^\\n]*\\} --> [^<\\n]+\\n)+\\n<\\/dd>\\n<\\/dl>\\n<\\/details>\\n";

/** The finishing-touch checkbox UI, with any checkbox ids and any number of option groups. */
const FINISHING_TOUCH_BLOCK = new RegExp(
  `\\n\\n<!-- finishing_touch_checkbox_start -->\\n\\n<details>\\n<summary><strong>✨ Finishing Touches<\\/strong><\\/summary>\\n<dl>\\n<dd>\\n\\n(?:${FINISHING_TOUCH_GROUP})+\\n<\\/dd>\\n<\\/dl>\\n<\\/details>\\n\\n<!-- finishing_touch_checkbox_end -->$`,
);

/** The Autofix/Autopilot checkbox, with any checkbox id, one-word label, and description. */
const AUTOPILOT_BLOCK =
  /\n<!-- autopilot:start -->\n- \[ \] <!-- \{[^\n]*\} --> <strong title="[^"\n]*">\w+<\/strong> · [^<\n]+\n<!-- autopilot:end -->$/;

/** Strips CodeRabbit's footer and header blocks so only the notice envelope remains. */
function stripChrome(body: string): string {
  return body
    .trim()
    .replace(/\n<!-- tips_start -->[\s\S]*?<!-- tips_end -->$/, "")
    .trim()
    .replace(AUTOPILOT_BLOCK, "")
    .trim()
    .replace(FINISHING_TOUCH_BLOCK, "")
    .trim()
    .replace(/^<!-- coderabbit-ai-generated:\S* -->\s*/, "")
    .replace(/^<!-- This is an auto-generated comment: summarize by coderabbit.ai -->\s*/, "")
    .replace(/^<!-- review_stack_entry_start -->[\s\S]*?<!-- review_stack_entry_end -->\s*/, "");
}

function isQuotedNotice(quoted: string): boolean {
  const onlyQuotedLines = quoted.split("\n").every((line) => !line.trim() || line.startsWith(">"));
  if (!onlyQuotedLines) return false;
  return (
    quoted.includes("> ## Review limit reached\n") ||
    quoted.includes("> ## Rate limit exceeded\n") ||
    quoted.includes("> ## Draft PR not reviewed\n") ||
    quoted.includes("> ## Review skipped\n") ||
    quoted.includes(
      "> Currently processing new changes in this PR. This may take a few minutes, please wait...",
    )
  );
}

/**
 * CodeRabbit progress, rate-limit, review-skipped and draft notices, its status-only command
 * replies, and its zero-findings, skipped-autofix, and failed-edit status comments. If the
 * comment is later edited into a PR walkthrough, its new body no longer matches and Shepherd
 * surfaces the edited minimized comment to the agent.
 */
const rule: ClassifyRule = (item) => {
  if (!isBotItem(item, ["coderabbitai"], ["pr-comment"])) return null;
  const body = stripChrome(item.body);
  const quoted = body.match(NOTICE_ENVELOPE)?.[2]?.trim();
  const isStatus = COMMAND_REPLY.test(body) || STATUS_COMMENTS.some((notice) => notice.test(body));
  if (!(quoted && isQuotedNotice(quoted)) && !isStatus) return null;
  return {
    autoResolve: true,
    suppress: true,
    reason: "CodeRabbit progress, review-limit, or skipped-review notice",
  };
};

export default rule;
