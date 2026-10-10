---
type: regex
target: last_message
match: contains
flags: i
weight: 1
---

build-suggestion-patches(?:\s|\\\n)+\S+(?:\s|\\\n)+--thread-id(?:\s|\\\n)+["']?PRRT_suggest["']?(?:\s|\\\n)+--message(?:\s|\\\n)+\S+
