---
type: regex
target: last_message
match: contains
flags: i
weight: 1
---

push(?:[^\n]|\\\n)*--force-with-lease
