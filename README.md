# Obsidian AutoCorrect Plugin

Correct double initial capitals such as `HAllo` → `Hallo`. Optional rules
capitalize sentence beginnings and the first word of lists and tasks.

## Input behavior

Only a complete word entered character by character in the current editor is
eligible. A whitespace character, Enter, or closing punctuation finishes it.
Dots, colons and similar ambiguous punctuation defer correction until a definite
boundary, so an unfinished email address or URL prefix is not changed early.

Pasting (even one character), drag-and-drop, completion, templates, composition,
selection replacements, undo/redo, and unclassified programmatic edits are not
corrected. A later space does not retroactively correct those words. Editing an
existing word or moving the cursor during a word also cancels eligibility.
Multi-cursor changes are conservatively skipped. Typing event labels are input
hints, not proof of physical key presses; mobile keyboards and third-party
plugins must be tested separately. IME, swipe input and replacement suggestions
are deliberately conservative rather than corrected while composing.

Only the just-finished word changes; old words elsewhere in the line do not.
CodeMirror applies the delimiter and correction in one transaction, preserving
selection mapping and normal undo grouping.

## Settings and command

- **Exclusion List:** comma-separated complete words. The comparison ignores
  case and normalizes Unicode to NFC. All correction rules share the same check;
  excluding `NB` also protects `NB,` and task/list occurrences.
- **Capitalize list items:** supports `-`, `*`, `+`, numbered markers `1.` and
  `1)`, tasks `[ ]`, `[x]`, `[X]`, nesting and quoted lists such as `> - [ ] task`.
- **Capitalize sentences:** supports Unicode letters, including `æ`, `ø`, `å`,
  Cyrillic and characters represented by surrogate pairs.
- **Abbreviations:** comma-separated abbreviations that do not end a sentence,
  including inside parentheses, for example `This (i.e. that).`.
- **Respect repeated spelling:** enabled by default. After `HAllo` becomes
  `Hallo`, deleting and retyping `HAllo` at that location leaves the second and
  subsequent identical attempts unchanged. The exception is local to that editor
  and disappears when moving to another word, changing focus, pausing, or
  changing settings. It never becomes a permanent word exclusion.
- **Excluded folders:** one vault-relative folder per line, including its
  subfolders. `Archive` excludes `Archive/Note.md`, not `ArchiveOld/Note.md`.
- **Pause/resume auto correction:** command-palette command. Pause lasts for this
  plugin session only. A status-bar label and a notice report its state. Pausing
  and resuming invalidate previously started words and retry exceptions.

A note can opt out with a Boolean frontmatter value:

```yaml
---
auto-correct-capitals: false
---
```

The string `"false"` is not the Boolean `false`. Invalid, unfinished or oversized
frontmatter conservatively disables correction until the header is valid.

## Protected text

Corrections skip YAML frontmatter, fenced/indented code, inline code, inline and
display math, HTTP/HTTPS and mailto targets, email addresses, Markdown link
locations/titles/reference identifiers, and Wikilink note/heading/block targets.
Visible Markdown link text and explicit Wikilink aliases remain eligible.
Unfinished destinations are protected while typing. Literal list-looking text
indented as a Markdown code block stays code; a nested list needs a parent list.

The editor's existing syntax tree is queried only when a replacement would
actually be needed. Small local scanners cover incomplete links and addresses;
a sparse delimiter-line index supplements math/frontmatter/code boundaries.
No per-keystroke scan from the start of the document, network call, polling,
second Markdown parser, or bundled copy of CodeMirror is used.

For bounded work, words/context longer than 4,096 UTF-16 units are skipped, as
are corrections on lines longer than that. YAML headers over 65,536 UTF-16 units
opt the note out. Missing syntax coverage skips a correction without forcing
synchronous parsing. Extremely large pastes or structural edits may require
updating delimiter metadata, but do not trigger word corrections.

## Development and validation

Use Node.js 22 or newer:

```bash
npm ci
npm test
npm run build
```

The plugin targets Obsidian 1.5.7 or newer (the installed Obsidian API type
baseline). CodeMirror packages are development dependencies and runtime imports
remain external. The plugin version is unchanged until a release is prepared.
Native acceptance on Obsidian desktop/mobile and the oldest supported version
is separate from TypeScript and automated transaction tests.

See [tests/README.md](tests/README.md) for test details and
[docs/OBSIDIAN_ACCEPTANCE.md](docs/OBSIDIAN_ACCEPTANCE.md) for native checks.

For a manual installation, copy the built `main.js` and `manifest.json` into
`<test-vault>/.obsidian/plugins/auto-correct-capitals/`, then enable the plugin
in that test vault. Keep `data.json` when upgrading an existing installation.
