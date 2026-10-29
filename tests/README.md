# Regression tests

Run from the repository root with Node.js 22 or newer:

```bash
npm ci
npm test
```

The suite bundles the actual `main.ts` with the existing esbuild dependency.
Only the Obsidian runtime classes and the editor document are mocked. Tests
call the production editor-change handler and assert the resulting text.
Unchanged inputs must not generate replacement operations.

`existing:` cases protect established behavior. Issue-numbered cases specify
the desired behavior for issues #12, #13, #15, #17, #18 and URL protection from
PR #16. The `protection:` cases exercise different protected and unprotected
positions within one editor-change event. Failures are intentional on the
unfixed baseline: do not change expected text to accommodate existing bugs.

Run just established behavior or one issue:

```bash
node --test --test-name-pattern='existing:' tests/regression.test.cjs
node --test --test-name-pattern='#18:' tests/regression.test.cjs
```

The harness represents a document immediately after typing a delimiter or
pressing Enter. It supports multiline documents and validates replacement
bounds. It does not simulate Obsidian's event scheduling, replacement-triggered
events, cursor mapping, undo history, plugin lifecycle, IME, or mobile input.
Those interactions require separate integration/manual checks in Obsidian.
No production-code changes or additional npm dependencies are required.

## Initial baseline (2026-10-29)

Verified locally with Node.js v22.23.1 on `fix/capitalization-regressions`:

| Group | Passed | Failed |
| --- | ---: | ---: |
| Existing behavior | 23 | 0 |
| #12: plus lists | 0 | 3 |
| #17: tasks | 0 | 9 |
| #13: punctuated exclusions | 0 | 4 |
| #15: parenthesized abbreviation | 0 | 1 |
| #18: Unicode sentence starts | 0 | 5 |
| PR #16: URLs and surrounding prose | 1 | 3 |
| Mixed protection contexts | 1 | 1 |
| Total | 25 | 26 |

`npm test` exits with code 1 because the regressions remain unfixed.
`npm run build` and `git diff --check` both pass. This is a baseline for the
subsequent fixes, not a release-ready test result.

## Fixed implementation (2026-10-29)

PR #19 was merged locally with its original commit and authorship retained.
The other reported issues and HTTP/HTTPS protection were implemented without
the dependency upgrades from PR #16. Only multiline block state is cached;
inline code, math and URL membership are evaluated per position.

The suite now includes Unicode surrogate pairs and length-changing casing,
task/exclusion combinations, custom abbreviations, mixed protection contexts,
and partially typed URL schemes. The original 51 expectations are retained.
Run `npm test` and `npm run build` before merging or releasing. Native Obsidian
validation remains separate from these document-level tests.

Verified result: **74 tests passed, 0 failed**, including all original 51 tests.
The production build and whitespace checks pass. Tests were run outside the
execution sandbox because its subprocess restrictions interfered with the
Node test runner and esbuild workers.
