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
| small | 0.0514 | 0.103 | 0.1909 |
| 10000-lines | 2.283 | 2.8124 | 5.1463 |
| 50000-lines | 18.1559 | 18.3096 | 21.7428 |
| 6000-math-delimiters | 1.2693 | 1.54 | 3.3653 |
| 100000-character-line | 6.5665 | 6.601 | 6.9199 |

Production bundle: **24,371 bytes**, **6,834 bytes gzip**.
Bundle tests verify that CodeMirror, Lezer, YAML test code and other dependencies
are not included in the output. Runtime imports use Obsidian's existing packages.

All four eligible scenarios actually corrected 100/100 words. The 100,000-character
line deliberately corrected 0/100 because it exceeds the documented context budget.
The 50,000-line case already spends roughly 18 ms per boundary in the baseline;
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
