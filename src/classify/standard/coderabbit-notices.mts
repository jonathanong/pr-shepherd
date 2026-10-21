import type { ClassifyRule } from "../types.mts";
import { isBotItem } from "./author.mts";

const NOTICE_ENVELOPE =
  /^<!-- This is an auto-generated comment: (rate limited|skip review|review in progress) by coderabbit.ai -->\n([\s\S]*?)\n<!-- end of auto-generated comment: \1 by coderabbit.ai -->$/;

const COMMAND_REPLY =
  /^<!-- This is an auto-generated reply by CodeRabbit -->\n<!-- CodeRabbit review command invocation: v2:[a-f0-9]+ -->\n<details>\n<summary>⚠️ Action not completed<\/summary>\n\n(?:Review rate limited\.|Review skipped: \d+ files exceed the limit of \d+\.)\n\n(?:> Note: CodeRabbit is an incremental review system and does not re-review already reviewed commits\. This command is applicable only when automatic reviews are paused\.|---\n\nYour included review limit is currently reached under our \[Fair Usage Limits Policy\]\(https:\/\/docs.coderabbit.ai\/management\/plans#fair-usage-limits-policy\)\. This review may still proceed through usage-based billing if eligible\. Your next included review will be available in \d+ minutes?\.)\n\n<\/details>$/;

const FINISHING_TOUCH_BLOCK = `<!-- finishing_touch_checkbox_start -->

<details>
<summary><strong>✨ Finishing Touches</strong></summary>
<dl>
<dd>

<details open>
<summary><strong>📝 Generate docstrings</strong></summary>
<dl>
<dd>

- [ ] <!-- {"checkboxId":"3e1879ae-f29b-4d0d-8e06-d12b7ba33d98"} --> Commit to this branch
- [ ] <!-- {"checkboxId":"7962f53c-55bc-4827-bfbf-6a18da830691"} --> Create a new PR

</dd>
</dl>
</details>
<details open>
<summary><strong>🧪 Generate unit tests (beta)</strong></summary>
<dl>
<dd>

- [ ] <!-- {"checkboxId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8", "radioGroupId": "utg-output-choice-group-unknown_comment_id"} --> Commit to this branch
- [ ] <!-- {"checkboxId": "f47ac10b-58cc-4372-a567-0e02b2c3d479", "radioGroupId": "utg-output-choice-group-unknown_comment_id"} --> Create a new PR

</dd>
</dl>
</details>

</dd>
</dl>
</details>

<!-- finishing_touch_checkbox_end -->`;

const AUTOPILOT_BLOCK =
  /\n<!-- autopilot:start -->\n- \[ \] <!-- \{"checkboxId":"2708ad07-9f24-4260-9c11-7dc76a49f2e3"\} --> <strong title="Keep fixing CodeRabbit findings and required CI, and resolving merge conflicts">Autofix<\/strong> · Keep fixing CodeRabbit findings and required CI, and resolving merge conflicts\n<!-- autopilot:end -->$/;

/** Strips CodeRabbit's footer and header blocks so only the notice envelope remains. */
function stripChrome(body: string): string {
  const withoutFooter = body
    .trim()
    .replace(/\n<!-- tips_start -->[\s\S]*?<!-- tips_end -->$/, "")
    .trim()
    .replace(AUTOPILOT_BLOCK, "")
    .trim();
  const withoutFinishingTouch = withoutFooter.endsWith(`\n\n${FINISHING_TOUCH_BLOCK}`)
    ? withoutFooter.slice(0, -FINISHING_TOUCH_BLOCK.length).trim()
    : withoutFooter;
  return withoutFinishingTouch
    .replace(/^<!-- coderabbit-ai-generated:v\d+ -->\s*/, "")
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
