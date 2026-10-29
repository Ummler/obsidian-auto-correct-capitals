# Local performance evidence (2026-10-29)

Run `npm run build` followed by `npm run benchmark` with Node.js 22 or newer.

This is a headless CodeMirror comparison on Linux / Node.js v22.23.1. Each case
contains 500 letter transactions and 100 word-boundary transactions after warmup.
The baseline uses the same Markdown editor without this plugin. Parser
preparation is explicitly outside the timed transactions and reported separately;
the production plugin never forces parsing. Document/editor creation is also
reported separately, including the initial sparse delimiter index.

| Scenario | Baseline boundary p50 (ms) | Plugin boundary p50 (ms) | Plugin boundary p95 (ms) |
| --- | ---: | ---: | ---: |
| small | 0.0515 | 0.1118 | 0.22 |
| 10000-lines | 2.2009 | 2.9153 | 5.3086 |
| 50000-lines | 17.0076 | 17.6013 | 22.3181 |
| 6000-math-delimiters | 1.2282 | 1.5547 | 2.818 |
| 100000-character-line | 7.2781 | 7.2655 | 7.54 |

Production bundle: **28,932 bytes**, **7,815 bytes gzip**.
Bundle tests verify that CodeMirror, Lezer, YAML test code and other dependencies
are not included in the output. Runtime imports use Obsidian's existing packages.

All four eligible scenarios actually corrected 100/100 words. The 100,000-character
line deliberately corrected 0/100 because it exceeds the documented context budget.
The 50,000-line case already spends roughly 17.0 ms per boundary in the baseline;
its total latency must not be attributed to the plugin alone. Noise can also make
individual plugin timings lower than the baseline. These numbers are not DOM,
Obsidian, mobile, or hardware acceptance and are not universal latency guarantees.

Normal letters reuse the block snapshot and do not query syntax protection.
A protection query inspects a bounded context and existing syntax nodes. File
eligibility and parsed frontmatter decisions are cached. Structural edits may
rebuild sparse marker metadata; there is no promise of constant cost for pasting
a large document or replacing many delimiters.

Full measurements, including creation and parser-preparation time, are in
[PERFORMANCE.json](PERFORMANCE.json). Native checks remain in
[OBSIDIAN_ACCEPTANCE.md](OBSIDIAN_ACCEPTANCE.md).

## Cursor/Enter repair and native evidence

The 2026-10-29 native Live Preview report showed 69 PASS / 3 FAIL: one-space
cursor insertion, Enter, and the first word after the large fixture. Its latency
measurements include the full host/editor/rendering pipeline; paused fields
remain registered and do not establish plugin-exclusive cost.

The first two causes were reproduced and fixed locally. Unavailable syntax now
has a distinct pending outcome: at most one correction can wait for parser
progress for 400 ms, without forced parsing, polling, or document-prefix copies.
Edits, selection changes, pause, file/policy changes, expiry and view destruction
cancel it. The pending state retains only positions, word/replacement and policy,
not an extra document snapshot. This adds constant-sized state and a view-update
check; it does not establish that parser availability caused the native failure.

Use the disabled-plugin mode in [LIVE_TEST.md](LIVE_TEST.md) for alternating
native comparisons. Diagnostic instrumentation is opt-in for the test run and
adds overhead of its own. These headless measurements are a fresh single run,
not a statistically isolated speedup or native release acceptance.
