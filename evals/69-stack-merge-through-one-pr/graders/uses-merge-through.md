---
type: regex
target: last_message
match: contains
flags: i
weight: 1
---

pr-shepherd stack\s+[^\n]*--merge-through\s+\S*(?:pull/|#)?632(?![0-9])
