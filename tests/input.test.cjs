const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EditorState, EditorSelection } = require('@codemirror/state');
const { markdown } = require('@codemirror/lang-markdown');
const { ensureSyntaxTree } = require('@codemirror/language');
const { CorrectionPolicy, DEFAULT_SETTINGS, correctionExtension, isProtected, typedEnter } = require('./helpers/runtime.cjs');

const { editor } = require('./helpers/session.cjs');

test('only the word before the cursor changes', () => {
  const e = editor('Existing.  TEst ');
  e.apply({ selection: { anchor: 10 } }); e.type('HAllo ');
  assert.equal(e.text(), 'Existing. Hallo  TEst ');
});
for (const userEvent of ['input.paste', 'input.drop', 'input.complete', 'input.type.compose', 'undo', 'redo', undefined]) {
  test(`do not correct ${userEvent || 'unannotated'} input on later space`, () => {
    const e = editor();
    e.apply({ changes: { from: 0, insert: 'HAllo' }, selection: { anchor: 5 }, userEvent });
    e.type(' '); assert.equal(e.text(), 'HAllo ');
  });
}
test('typing new word after paste works', () => {
  const e = editor();
  e.apply({ changes: { from: 0, insert: 'HAllo ' }, selection: { anchor: 6 }, userEvent: 'input.paste' });
  e.type('TEst '); assert.equal(e.text(), 'HAllo Test ');
});
test('multi-character typed replacements are skipped', () => {
  const e = editor();
  e.apply({ changes: { from: 0, insert: 'HAllo' }, selection: { anchor: 5 }, userEvent: 'input.type' });
  e.type(' '); assert.equal(e.text(), 'HAllo ');
});
test('selection replacement is skipped', () => {
  const e = editor('abc'); e.apply({ selection: { anchor: 0, head: 3 } });
  e.apply({ changes: { from: 0, to: 3, insert: 'H' }, selection: { anchor: 1 }, userEvent: 'input.type' });
  e.type('Allo '); assert.equal(e.text(), 'HAllo ');
});
test('cursor move invalidates word ownership', () => {
  const e = editor(); e.type('HAllo');
  e.apply({ selection: { anchor: 0 } }); e.apply({ selection: { anchor: 5 } });
  e.type(' '); assert.equal(e.text(), 'HAllo ');
});
test('Enter with auto-inserted list marker completes the previous word', () => {
  const e = editor('- '); e.type('HAllo');
  e.apply({ changes: { from: 7, insert: '\n- ' }, selection: { anchor: 10 },
    userEvent: 'input', annotations: typedEnter.of(true) });
  assert.equal(e.text(), '- Hallo\n- ');
});
test('programmatic newline is not typed Enter', () => {
  const e = editor(); e.type('HAllo');
  e.apply({ changes: { from: 5, insert: '\n' }, userEvent: 'input' });
  assert.equal(e.text(), 'HAllo\n');
});
test('independent editors have independent typed spans', () => {
  const a = editor(), b = editor('HAllo'); a.type('HAllo'); b.type(' '); a.type(' ');
  assert.equal(a.text(), 'Hallo '); assert.equal(b.text(), 'HAllo ');
});
test('multiple cursors are skipped', () => {
  const e = editor('HAllo TEst');
  e.apply({ selection: EditorSelection.create([EditorSelection.cursor(5), EditorSelection.cursor(10)]),
    effects: require('@codemirror/state').StateEffect.appendConfig.of(EditorState.allowMultipleSelections.of(true)) });
  e.apply({ changes: [{ from: 5, insert: ' ' }, { from: 10, insert: ' ' }], userEvent: 'input.type' });
  assert.equal(e.text(), 'HAllo  TEst ');
});
test('ordinary letters do not query protection', () => {
  let queries = 0;
  const e = editor('', {}, () => { queries++; return false; });
  e.type('HAllo'); assert.equal(queries, 0);
  e.type(' '); assert.equal(queries, 1);
});
test('tab-indented code is not a nested list without a parent', () => {
  const e = editor('\t1. ', { capitalizeListItem: true }); e.type('hallo ');
  assert.equal(e.text(), '\t1. hallo ');
});
test('a typed delimiter separates a newly inserted word from the existing suffix', () => {
  const e = editor('world'); e.apply({ selection: { anchor: 0 } });
  e.type('HAllo '); assert.equal(e.text(), 'Hallo world');
});
test('one-space cursor insertion corrects only the newly typed word', () => {
  const e = editor('Wort Wort HAllo'); e.apply({ selection: { anchor: 5 } });
  e.type('TEst '); assert.equal(e.text(), 'Wort Test Wort HAllo');
});
test('typing inside an existing word never claims that word', () => {
  const e = editor('xxrest'); e.apply({ selection: { anchor: 2 } });
  e.type('TEst '); assert.equal(e.text(), 'xxTEst rest');
});
test('single-character paste does not make the rest of the word eligible', () => {
  const e = editor();
  e.apply({ changes: { from: 0, insert: 'H' }, selection: { anchor: 1 }, userEvent: 'input.paste' });
  e.type('Allo '); assert.equal(e.text(), 'HAllo ');
});
test('Unicode casing expansion keeps the cursor and subsequent words correct', () => {
  const e = editor('', { capitalizeSentences: true }); e.type('ßeta next ');
  assert.equal(e.text(), 'SSeta next ');
  assert.equal(e.state.selection.main.head, e.state.doc.length);
});
test('astral letters are entered and corrected without splitting code points', () => {
  const e = editor('', { capitalizeSentences: true }); e.type('𐐨word ');
  assert.equal(e.text(), '𐐀word ');
  assert.equal(e.state.selection.main.head, e.state.doc.length);
});
