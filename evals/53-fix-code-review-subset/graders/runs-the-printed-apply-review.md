---
type: regex
target: last_message
match: contains
flags: i
weight: 1
---

pr-shepherd\s+apply\s+review\s+https://github\.com/owner/repo/pull/42(?![0-9])
