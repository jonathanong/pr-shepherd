---
type: regex
target: last_message
match: contains
flags: i
weight: 1
---

gh pr merge 42 --repo owner/repo --match-head-commit abc123 --auto --merge
