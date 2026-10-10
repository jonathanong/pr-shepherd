---
type: regex
target: last_message
match: contains
flags: i
weight: 1
---

pr-shepherd apply journal https://github\.com/owner/repo/pull/42\s+['"]-\s+(?!<decision>)[^'"]+['"]
