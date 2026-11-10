---
type: regex
target: last_message
match: contains
flags: i
weight: 1
---

pr-shepherd\b(?=(?:[^\n;&|]|\\\n)*\b41\b)(?=(?:[^\n;&|]|\\\n)*\b42\b)(?=(?:[^\n;&|]|\\\n)*--until-terminal)
