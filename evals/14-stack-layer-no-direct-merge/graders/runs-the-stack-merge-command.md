---
type: regex
target: last_message
match: contains
flags: i
weight: 1
---

--stack\s+\S*pull/42(?![0-9])[^\n]*--merge
