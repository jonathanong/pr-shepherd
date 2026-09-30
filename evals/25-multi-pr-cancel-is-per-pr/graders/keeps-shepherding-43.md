---
type: regex
target: last_message
match: contains
flags: i
weight: 1
---

pr-shepherd\s+(?:https://github\.com/owner/repo/pull/|owner/repo#|#)?43\b
