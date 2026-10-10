---
type: regex
target: last_message
match: contains
flags: i
weight: 1
---

pr-shepherd\b(?=(?:[^\n]|\\\n)*--until-terminal)(?=(?:[^\n]|\\\n)*--merge)
