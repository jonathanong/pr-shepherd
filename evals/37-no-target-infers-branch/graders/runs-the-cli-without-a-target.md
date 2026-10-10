---
type: regex
target: last_message
match: contains
flags: i
weight: 1
---

pr-shepherd(?:\s|\\\n)+--until-terminal
