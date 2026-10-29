const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EditorState, EditorSelection } = require('@codemirror/state');
const { markdown } = require('@codemirror/lang-markdown');
const { ensureSyntaxTree } = require('@codemirror/language');
const { CorrectionPolicy, DEFAULT_SETTINGS, correctionExtension, isProtected, typedEnter } = require('./helpers/runtime.cjs');

function editor(doc = '', settings = {}, protection = isProtected) {
  const policy = new CorrectionPolicy({ ...DEFAULT_SETTINGS, ...settings });
  let state = EditorState.create({ doc, selection: { anchor: doc.length },
    extensions: [markdown(), correctionExtension(() => policy, protection)] });
  const apply = spec => {
    ensureSyntaxTree(state, state.doc.length, 1000);
    const tr = state.update(spec);
    state = tr.state;
    return tr;
  };
  return {
    get state() { return state; }, apply,
    type(text) {
      for (const char of text) apply({ changes: { from: state.selection.main.head, insert: char },
        userEvent: 'input.type', selection: { anchor: state.selection.main.head + char.length } });
    },
    text: () => state.doc.toString(),
  };
}

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

module.exports = { editor };
