---
type: regex
target: last_message
match: contains
flags: i
weight: 1
---

pr-shepherd(?!(?:[^\n;&|]|\\\n)*?(?:https?://|#\d|(?:[^\S\n]|\\\n)\d+(?![^\s;&|])))(?:[^\S\n]|\\\n)+--until-terminal
