---
type: regex
target: last_message
match: contains
flags: i
weight: 1
---

pr-shepherd stack\s+[^\n]*603(?![0-9])[^\n]*--merge-ready
