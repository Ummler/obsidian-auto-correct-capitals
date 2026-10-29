const { test } = require('node:test');
const assert = require('node:assert/strict');
const { editor } = require('./helpers/session.cjs');
const { headerPolicy } = require('./helpers/runtime.cjs');

for (const prefix of ['> - ', '> > + [ ] ', '  > 12) ', '> 1) [x] ', '23) ']) {
  test(`capitalize quoted/numbered list after ${prefix}`, () => {
    const e = editor(prefix, { capitalizeListItem: true }); e.type('hallo ');
    assert.equal(e.text(), prefix + 'Hallo ');
  });
}
for (const file of ['Archiv/Note.md', 'Archiv/Unterordner/Note.md']) {
  test(`folder opt-out: ${file}`, () => {
    const e = editor('', { excludedFolders: ['Archiv/'] }, undefined, file); e.type('HAllo ');
    assert.equal(e.text(), 'HAllo ');
  });
}
test('folder matching respects path boundaries', () => {
  const e = editor('', { excludedFolders: ['Archiv'] }, undefined, 'Archivierung/Note.md');
  e.type('HAllo '); assert.equal(e.text(), 'Hallo ');
});
test('root note is not excluded by an empty folder setting', () => {
  const e = editor('', { excludedFolders: ['', '  '] }); e.type('HAllo ');
  assert.equal(e.text(), 'Hallo ');
});
for (const value of ['false', 'false # comment']) {
  test(`frontmatter opts out with ${value}`, () => {
    const prefix = `---\nauto-correct-capitals: ${value}\n---\n`;
    const e = editor(prefix); e.type('HAllo '); assert.equal(e.text(), prefix + 'HAllo ');
  });
}
for (const value of ['true', '"false"']) {
  test(`frontmatter ${value} does not opt out`, () => {
    const prefix = `---\nauto-correct-capitals: ${value}\n---\n`;
    const e = editor(prefix); e.type('HAllo '); assert.equal(e.text(), prefix + 'Hallo ');
  });
}
test('invalid YAML conservatively disables correction', () => {
  const prefix = '---\nbroken: [\n---\n'; const e = editor(prefix); e.type('HAllo ');
  assert.equal(e.text(), prefix + 'HAllo ');
});
test('editing frontmatter immediately updates opt-out', () => {
  const prefix = '---\nauto-correct-capitals: true\n---\n'; const e = editor(prefix);
  const from = prefix.indexOf('true');
  e.apply({ changes: { from, to: from + 4, insert: 'false' }, userEvent: 'input.paste',
    selection: { anchor: prefix.length + 1 } });
  e.type('HAllo '); assert.ok(e.text().endsWith('HAllo '));
});
test('body edits reuse cached frontmatter decision', () => {
  const e = editor('---\ntitle: Test\n---\n'); const old = e.state.field(headerPolicy);
  e.type('HAllo '); assert.equal(e.state.field(headerPolicy), old);
});
test('file switch resets typed-word ownership', () => {
  const e = editor(); e.type('HAllo'); e.setFilePath('Other.md'); e.type(' ');
  assert.equal(e.text(), 'HAllo ');
});
test('rename into an excluded folder takes effect', () => {
  const e = editor('', { excludedFolders: ['Archiv'] }); e.type('HAllo');
  e.setFilePath('Archiv/Note.md'); e.type(' '); assert.equal(e.text(), 'HAllo ');
});
test('editor without a file is skipped', () => {
  const e = editor('', {}, undefined, null); e.type('HAllo '); assert.equal(e.text(), 'HAllo ');
});
