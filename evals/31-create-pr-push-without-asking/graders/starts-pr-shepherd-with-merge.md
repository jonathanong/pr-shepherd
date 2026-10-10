---
type: regex
target: last_message
match: contains
flags: i
weight: 1
---

pr-shepherd\b(?=.*--until-terminal)(?=.*--merge)
