---
type: regex
target: last_message
match: contains
flags: i
weight: 1
---

build-suggestion-patches(?:\s|\\\n)+https://github\.com/owner/repo/pull/42(?:\s|\\\n)+--thread-id(?:\s|\\\n)+["']?PRRT_suggest["']?(?:\s|\\\n)+--message(?:\s|\\\n)+(?:"\s*[^"\s][^"]*"|'\s*[^'\s][^']*'|[^\s"']\S*)
