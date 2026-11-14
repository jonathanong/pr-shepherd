---
type: regex
target: last_message
match: contains
flags: i
weight: 1
---

pr-shepherd\s+(?:\S+\s+)*\S*pull/42(?![0-9])\S*\s+[^\n]*--merge(?![-\w])
