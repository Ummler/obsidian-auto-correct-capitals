const { test } = require('node:test');
const assert = require('node:assert/strict');
const { undo, redo } = require('@codemirror/commands');
const { editor } = require('./helpers/session.cjs');

function erase(e) {
  e.apply({ changes: { from: 0, to: e.state.doc.length }, selection: { anchor: 0 }, userEvent: 'delete.backward' });
}
test('identical second and third attempts at same location are respected', () => {
  const e = editor(); e.type('HAllo '); assert.equal(e.text(), 'Hallo ');
  erase(e); e.type('HAllo '); assert.equal(e.text(), 'HAllo ');
  erase(e); e.type('HAllo '); assert.equal(e.text(), 'HAllo ');
});
test('backspacing word letter by letter retains retry exception', () => {
  const e = editor(); e.type('HAllo ');
  while (e.state.doc.length) {
    const end = e.state.doc.length;
    e.apply({ changes: { from: end - 1, to: end }, selection: { anchor: end - 1 }, userEvent: 'delete.backward' });
  }
  e.type('HAllo '); assert.equal(e.text(), 'HAllo ');
});
test('disabled setting corrects the same spelling again', () => {
  const e = editor('', { respectRepeatedSpelling: false }); e.type('HAllo ');
  erase(e); e.type('HAllo '); assert.equal(e.text(), 'Hallo ');
});
test('same word at another location is corrected', () => {
  const e = editor(); e.type('HAllo HAllo '); assert.equal(e.text(), 'Hallo Hallo ');
});
test('moving outside the word ends the exception', () => {
  const e = editor('prefix '); e.type('HAllo ');
  e.apply({ selection: { anchor: 0 } });
  e.apply({ changes: { from: 7, to: 13 }, selection: { anchor: 7 }, userEvent: 'delete.backward' });
  e.type('HAllo '); assert.equal(e.text(), 'prefix Hallo ');
});
test('a different typo at same position can be corrected', () => {
  const e = editor(); e.type('HAllo '); erase(e); e.type('TEst ');
  assert.equal(e.text(), 'Test ');
});
test('Unicode normalization is shared by all correction rules', () => {
  const e = editor('- ', { capitalizeListItem: true, exclusionList: ['Élan'] });
  e.type('e\u0301lan '); assert.equal(e.text(), '- e\u0301lan ');
});
test('excluded word bypasses double-capital and sentence rules together', () => {
  const e = editor('', { capitalizeSentences: true, exclusionList: ['HAllo'] });
  e.type('HAllo '); assert.equal(e.text(), 'HAllo ');
});
test('settings change clears active input and retry state', () => {
  const e = editor(); e.type('HAllo '); erase(e);
  e.configure({ respectRepeatedSpelling: false });
  e.type('HAllo '); assert.equal(e.text(), 'Hallo ');
});
test('undo and redo preserve document and do not retrigger corrections', () => {
  const e = editor(); e.type('HAllo ');
  assert.equal(undo({ state: e.state, dispatch: e.apply }), true);
  assert.equal(e.text(), '');
  assert.equal(redo({ state: e.state, dispatch: e.apply }), true);
  assert.equal(e.text(), 'Hallo ');
  assert.equal(undo({ state: e.state, dispatch: e.apply }), true);
  e.type('HAllo '); assert.equal(e.text(), 'HAllo ');
});
