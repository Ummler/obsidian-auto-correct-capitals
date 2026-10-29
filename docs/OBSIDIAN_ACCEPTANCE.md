# Native Obsidian acceptance (pending)

Automated tests do not establish native acceptance. These checks have not been
marked passed by the implementation agent. Run them in a separate test vault,
first in Source mode and then in Live Preview. Test current desktop Obsidian,
the declared minimum 1.5.7, and supported mobile devices/keyboards separately.
Do not install this development build into the main vault for acceptance.

For a visible character-by-character run with input-event diagnostics, use
[the desktop live-test script](LIVE_TEST.md). It records observed failures;
automated driver tests do not establish that the native run passes.

## Setup

1. Run `npm ci`, `npm test`, `npm run build` in the repository.
2. Copy `main.js` and `manifest.json` into the test vault's
   `.obsidian/plugins/auto-correct-capitals/` directory.
3. Enable community plugins and this plugin in the test vault.
4. Enable sentence and list capitalization for the corresponding checks.

## Checklist

- [ ] Type `HAllo `; only the current word becomes `Hallo `.
- [ ] Type in the middle of `before  TEst`; the word on the right stays unchanged.
- [ ] Paste `HAllo`, then type a space; it stays unchanged. Repeat with a one-letter
      paste followed by typing the rest, drop, completion and a template.
- [ ] Compose accented/non-Latin text using an IME. No corrections during
      composition, no broken surrogate pairs, and no later surprise correction.
- [ ] Type list and task text after `+ `, `1) `, `> - `, `> > 1) [ ] `.
- [ ] Press Enter in a list; auto-inserted markers and the cursor remain correct.
- [ ] Undo the correction/input once, then redo. No re-correction loop.
- [ ] Delete corrected `Hallo ` and retype `HAllo ` at the same location; the
      second spelling stays unchanged. Repeat with the setting disabled.
- [ ] Exclude `NB`, then type `NB,` in a list and task. Exclude `iPhone` and type
      `iphone ` at sentence start. No rule bypasses the exclusion.
- [ ] Type `This (i.e. that).`; `that` stays lowercase.
- [ ] Type code, double-backtick code, math, fenced blocks and frontmatter.
      Add/delete an opening/closing fence above the cursor and repeat.
- [ ] Type incomplete Markdown targets and Wikilink note/heading/block targets.
      Visible Markdown text and a Wikilink alias can still be corrected.
- [ ] Type `HAllo.Name@EXample.com ` and `https://example.com/HAllo ` unchanged.
- [ ] Move two independent editor panes between different files; ownership and
      repetition exceptions never leak across panes or files.
- [ ] Exclude `Archive`; verify `Archive/Note.md` is excluded while
      `ArchiveOld/Note.md` remains enabled. Rename a file between these folders.
- [ ] Set `auto-correct-capitals: false` in frontmatter; edit it live to `true`.
      Quoted `"false"` does not opt out; malformed YAML is conservative.
- [ ] Pause/resume from the command palette; check status/notice and reset of a
      half-typed word. Restart the plugin; it starts unpaused.
- [ ] Disable/re-enable the plugin repeatedly. No duplicated correction,
      persistent listener, or duplicate status item.
- [ ] On a large note, type near the end and inspect input latency in DevTools.
      Very long single lines are deliberately skipped, not synchronously parsed.

Record Obsidian version, OS, editor mode, keyboard/input method, outcome and any
console errors for each native run. No GitHub publication is needed for these
checks.
