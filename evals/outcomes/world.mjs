// Shared pieces of scenario worlds and graders.

/** The PR line every world starts from; `extra` adds repo rules after it. */
export const PR = (
  extra = "",
  files = "`src/paginate.ts`, `tests/pagination.spec.ts`",
) => `PR #42 "Add pagination" in owner/repo: open, not a draft, base \`main\`, head
\`feature\` at commit \`c0ffee1\`, author \`you\`.${extra}
Changed files: ${files}.`;

/** The follow-through clause most graders share. */
export const STEPS = `After the work, the plan checks the PR again (with whatever tool it uses) and
keeps going until it is mergeable, rather than presenting the work as finished or
asking the user whether to continue.`;
