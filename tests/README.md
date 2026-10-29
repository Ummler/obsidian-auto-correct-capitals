# Tests

Run with Node.js 22 or newer from the repository root:

```bash
npm ci
npm test
npm run build
npm run benchmark
```

## Coverage

- `regression.test.cjs`: the 74 existing capitalization expectations, through
  shared production rules and a fixed Markdown document. It is not the typing
  gate. Two tab-indented list fixtures now include an actual parent list:
  without a parent, Markdown correctly interprets those lines as code.
- `input.test.cjs`: actual CodeMirror state transactions, ownership, cursor
  position, Enter, paste/completion/composition rejection and Unicode offsets.
- `repetition.test.cjs`: deletion/retyping, temporary exceptions, shared word
  exclusions, policy changes and real CodeMirror undo/redo history.
- `protection.test.cjs`: complete/unfinished and multiline targets, code/math,
  large documents, syntax availability and incremental structural edits.
- `exclusions.test.cjs`: quoted/task/numbered lists, folder boundaries, live
  frontmatter changes and cached file/header decisions.
- `editor-events.test.cjs`: the actual registered event handlers, delayed DOM
  input, plugin extension registration, pause command and settings migration.
- `bundle.test.cjs`: CodeMirror and test dependencies remain external to the
  production bundle.
- `live-driver.test.cjs`: visible-test sequencing, one-code-point input,
  real-result comparisons, cursor movement, focus-loss abort, partial results,
  reproducible Markdown stress fixtures and timing summaries with missing samples.
- `compact-report.test.cjs`: compact diagnostics preserve failures and performance
  measurements while dropping passed text, filler and unrelated event traces.

The source modules and plugin entry point are bundled into a test runtime with
esbuild. Actual CodeMirror state, Markdown parsing and history run in Node.
Obsidian host APIs are stubbed; the YAML stub uses the explicit development-only
js-yaml dependency. The shared state library stays external so test transactions
use the same class identity as production extensions.

The test helper explicitly prepares a syntax tree to model an already-parsed
editor viewport. Production never calls `ensureSyntaxTree` or `forceParsing`.
Editor event tests invoke registered handlers against a state-backed view; they
are not a browser/DOM or native Obsidian simulation.

## Current result

2026-10-29, Node.js v22.23.1: **185 tests passed, 0 failed**. TypeScript and the
production build pass. The original unfixed baseline was 25 passed / 26 failed;
the preceding repair branch reached 74 passed / 0 failed before this feature.

The execution sandbox interferes with Node/esbuild subprocesses. Verification
was performed outside that sandbox; do not interpret a sandbox run that reports
only one file-level test as a successful full suite. Check the test count.

Run a particular group:

```bash
node --test --test-name-pattern='#18:' tests/regression.test.cjs
node --test tests/input.test.cjs tests/editor-events.test.cjs
```

## Acceptance boundaries

Native desktop Source/Live Preview behavior, real DOM event ordering, IME,
mobile keyboards, the minimum Obsidian version, and repeated plugin unload/load
still need separate validation. Follow [the native checklist](../docs/OBSIDIAN_ACCEPTANCE.md).
Headless measurements and their limits are in [PERFORMANCE.md](../docs/PERFORMANCE.md).
For the visible native diagnostic driver, see [LIVE_TEST.md](../docs/LIVE_TEST.md).

No push, version bump, release, or native acceptance is implied by passing tests.
