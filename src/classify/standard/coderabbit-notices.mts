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

const CHAT_WAIT = String.raw`\d+ (?:hours?(?:, \d+ minutes?,? and \d+ seconds?| and \d+ (?:minutes?|seconds?))?|minutes?(?: and \d+ seconds?)?|seconds?)`;
const CHAT_COUNT = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)`;

/** CodeRabbit's chat rate-limit notice, posted on review-thread replies and conversation comments. */
const CHAT_RATE_LIMIT = new RegExp(
  String.raw`^### Rate Limit Exceeded\n\n` +
    String.raw`(?:` +
    "`@[A-Za-z0-9_-]+(?:\\[bot\\])?`" +
    String.raw`|@[A-Za-z0-9_-]+(?:\[bot\])?|You) (?:have|has) exceeded the limit for the number of chat messages per (?:hour|minute|day)\. ` +
    String.raw`Please wait \*\*${CHAT_WAIT}\*\* before sending another message\.` +
    String.raw`(?:\n\nCodeRabbit didn['’]t process this message and won['’]t process it later\. ` +
    String.raw`Send it again after \*\*\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\*\*\.)?` +
    String.raw`(?:\n\nYou can send ${CHAT_COUNT} chat messages an? (?:hour|minute|day) in repositories owned by ` +
    "`[A-Za-z0-9_-]+`" +
    String.raw`\. The whole allowance comes back at once each (?:hour|minute|day), and a burst of messages within a few seconds pauses chat for about a minute\. ` +
    String.raw`\[Chat rate limits\]\(https:\/\/docs\.coderabbit\.ai\/[^\s)]*\))?$`,
);

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
    .replace(/\r\n/g, "\n")
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

/** The "Review info" block that follows a progress notice: it opens with this summary line. */
const REVIEW_INFO_START =
  /\n<details>\n<summary><strong>(?:<picture>(?:<source [^>\n]*>)*<img [^>\n]*><\/picture> )?Review info<\/strong><\/summary>\n/;

/**
 * Lines the "Review info" block may hold: layout tags, picture-icon summaries, `- **Key**: value`
 * settings with CodeRabbit's known keys, file bullets, and the commit-range sentence. Any other line keeps the comment visible.
 */
const REVIEW_INFO_LINE =
  /^(?:|<\/?details>|<\/?dl>|<\/?dd>|<br>|<summary><strong>(?:<picture>(?:<source [^>]*>)*<img [^>]*><\/picture> )?(?:Review info|Run configuration|Commits|Files selected for processing: \d+)<\/strong><\/summary>|- \*\*(?:Source mode|Repository|Branch|File|Commit|Layers|Review profile|Plan|Run ID)\*\*: [^<>\n]*|\* `[^`\n]+`|Reviewing files that changed from the base of the PR and between [a-f0-9]+ and [a-f0-9]+\.)$/;

/** Removes a trailing "Review info" block made only of known metadata lines. */
function stripReviewInfo(quoted: string): string {
  const start = quoted.search(REVIEW_INFO_START);
  if (start < 0) return quoted;
  const info = quoted.slice(start).split("\n");
  return info.every((line) => REVIEW_INFO_LINE.test(line)) ? quoted.slice(0, start) : quoted;
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
 * replies, its zero-findings, skipped-autofix, and failed-edit status comments, and its chat
 * rate-limit notices (on conversation comments and review-thread replies). If a conversation
 * comment is later edited into a PR walkthrough, its new body no longer matches and Shepherd
 * surfaces the edited minimized comment to the agent.
 */
const rule: ClassifyRule = (item) => {
  if (isBotItem(item, ["coderabbitai"], ["review-thread-reply"])) {
    const body = stripChrome(item.body);
    if (!CHAT_RATE_LIMIT.test(body)) return null;
    return {
      suppress: true,
      reason: "CodeRabbit chat rate-limit notice",
    };
  }
  if (!isBotItem(item, ["coderabbitai"], ["pr-comment"])) return null;
  const body = stripChrome(item.body);
  if (CHAT_RATE_LIMIT.test(body)) {
    return {
      autoResolve: true,
      suppress: true,
      reason: "CodeRabbit chat rate-limit notice",
    };
  }
  const envelope = body.match(NOTICE_ENVELOPE)?.[2];
  const quoted = envelope === undefined ? undefined : stripReviewInfo(envelope).trim();
  const isStatus = COMMAND_REPLY.test(body) || STATUS_COMMENTS.some((notice) => notice.test(body));
  if (!(quoted && isQuotedNotice(quoted)) && !isStatus) return null;
  return {
    autoResolve: true,
    suppress: true,
    reason: "CodeRabbit progress, review-limit, or skipped-review notice",
  };
};

export default rule;
