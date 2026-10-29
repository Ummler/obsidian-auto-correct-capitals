const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EditorState } = require('@codemirror/state');
const { markdown } = require('@codemirror/lang-markdown');
const { ensureSyntaxTree } = require('@codemirror/language');
const { blockContext, blockProtected, isProtected, localProtected } = require('./helpers/runtime.cjs');
const { editor } = require('./helpers/session.cjs');

for (const prefix of ['[text](', '[text](path/', '[text](<', '[[', '[[Note#', '[[Note^', '[text][', '[ref]: ', '<mailto:', 'name@']) {
  test(`protect unfinished destination after ${prefix}`, () => {
    const e = editor(prefix); e.type('HAllo ');
    assert.equal(e.text(), prefix + 'HAllo ');
  });
}
test('Markdown visible text remains editable', () => {
  const e = editor('['); e.type('HAllo '); assert.equal(e.text(), '[Hallo ');
});
test('Wikilink alias remains editable', () => {
  const e = editor('[[Note|'); e.type('HAllo '); assert.equal(e.text(), '[[Note|Hallo ');
});
test('plain text following a link is editable', () => {
  const e = editor('[text](path) '); e.type('HAllo '); assert.equal(e.text(), '[text](path) Hallo ');
});
test('email local part is not changed before its domain is known', () => {
  const e = editor(); e.type('HAllo.Name@EXample.com ');
  assert.equal(e.text(), 'HAllo.Name@EXample.com ');
});
test('period is deferred until a definite boundary', () => {
  const e = editor(); e.type('HAllo.'); assert.equal(e.text(), 'HAllo.');
  e.type(' '); assert.equal(e.text(), 'Hallo. ');
});
test('double-backtick code remains protected before closing delimiter', () => {
  const e = editor('``'); e.type('HAllo '); assert.equal(e.text(), '``HAllo ');
});
test('a different-length backtick run does not close code', () => {
  assert.equal(localProtected('``x` HAllo ', 6, 11), true);
});
test('entire candidate range is checked', () => {
  assert.equal(localProtected('text [x](target)', 0, 14), true);
});
test('missing syntax coverage conservatively skips correction', () => {
  const state = EditorState.create({ doc: 'HAllo', extensions: [blockContext] });
  assert.equal(isProtected(state, 0, 5), true);
});
test('long lines are skipped without unbounded scanning', () => {
  const e = editor('x'.repeat(5000) + ' '); e.type('HAllo ');
  assert.ok(e.text().endsWith('HAllo '));
});
for (const opening of ['$$', '```text', '~~~text', '---']) {
  test(`multiline protection near end of large document: ${opening}`, () => {
    const e = editor(opening + '\n' + 'line\n'.repeat(1500)); e.type('HAllo ');
    assert.ok(e.text().endsWith('HAllo '));
  });
}
test('structural edits update display-math protection', () => {
  let state = EditorState.create({ doc: '$$\nx\n$$\ntext', extensions: [blockContext] });
  assert.equal(blockProtected(state, state.doc.length), false);
  state = state.update({ changes: { from: 5, to: 7 } }).state;
  assert.equal(blockProtected(state, state.doc.length), true);
  state = state.update({ changes: { from: 5, insert: '$$' } }).state;
  assert.equal(blockProtected(state, state.doc.length), false);
});
test('ordinary letter retains sparse block snapshot by identity', () => {
  const state = EditorState.create({ doc: '$$\nx\n$$\ntext', extensions: [blockContext] });
  const updated = state.update({ changes: { from: state.doc.length, insert: 'a' } }).state;
  assert.equal(updated.field(blockContext), state.field(blockContext));
});
test('frontmatter close and math inside fenced code do not leak', () => {
  const doc = '---\ntitle: x\n---\n```\n$$\n```\nHAllo';
  const state = EditorState.create({ doc, extensions: [blockContext, markdown()] });
  ensureSyntaxTree(state, doc.length, 1000);
  assert.equal(isProtected(state, doc.length - 5, doc.length), false);
});
