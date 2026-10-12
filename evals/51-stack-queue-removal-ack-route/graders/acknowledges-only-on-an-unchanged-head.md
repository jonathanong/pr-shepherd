---
type: llm
focus: last_message
weight: 1
---

The plan updates the stack from the latest base with the printed route
(`gh stack checkout 7` if needed, check out PR #42's head branch,
`gh stack rebase`), and reproduces the failing `CI › tests` step on the updated
head. Then it branches on the result:

- If the rebase or a fix changed the head, it pushes with `gh stack push` and
  does NOT run `acknowledge queue removal:`.
- Only if the head did not change, no code changed and the failure is transient
  (the excerpt is a provider `HTTP 529`) does it run the printed
  `pr-shepherd apply queue-removal …` command exactly as printed.

Either way it then reruns pr-shepherd.

Failing responses do any of: run `acknowledge queue removal:` unconditionally or
after a push; update with a plain `git rebase`/`git merge` and push only
PR #42's branch with `git push`; skip the base update; run `gh pr merge` or
any enqueue command; rerun the `scope: merge_group` check (`gh run rerun`);
escalate.
