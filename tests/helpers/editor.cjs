const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { buildSync } = require('esbuild');

// Compile the real entry point; only the unavailable Obsidian runtime is mocked.
const { outputFiles } = buildSync({
  entryPoints: [path.join(__dirname, '../../main.ts')],
  bundle: true,
  external: ['obsidian'],
  format: 'cjs',
  platform: 'node',
  target: 'es2020',
  write: false,
});
const pluginModule = { exports: {} };
vm.runInNewContext(outputFiles[0].text, {
  module: pluginModule,
  exports: pluginModule.exports,
  require(id) {
    assert.equal(id, 'obsidian', 'Unexpected runtime dependency');
    return {
      Plugin: class {},
      PluginSettingTab: class {},
      Setting: class {},
    };
  },
  console,
});
const AutoCorrectPlugin = pluginModule.exports.default;

function createEditor(text, cursor) {
  let content = text;
  const edits = [];
  const lines = () => content.split('\n');
  const end = () => {
    const all = lines();
    return { line: all.length - 1, ch: all[all.length - 1].length };
  };
  const offset = (position) => {
    const all = lines();
    assert.ok(Number.isInteger(position.line));
    assert.ok(position.line >= 0 && position.line < all.length);
    assert.ok(Number.isInteger(position.ch));
    assert.ok(position.ch >= 0 && position.ch <= all[position.line].length);
    return all.slice(0, position.line).reduce((sum, line) => sum + line.length + 1, 0)
      + position.ch;
  };
  const doc = {
    getCursor: () => cursor || end(),
    getLine: (line) => lines()[line],
    getRange: (from, to) => content.slice(offset(from), offset(to)),
    replaceRange(replacement, from, to = from) {
      const start = offset(from);
      const finish = offset(to);
      assert.ok(start <= finish);
      edits.push({ replacement, from: { ...from }, to: { ...to } });
      content = content.slice(0, start) + replacement + content.slice(finish);
    },
  };
  return { getDoc: () => doc, text: () => content, edits };
}

function correct(text, settings = {}, { enter = false, cursor } = {}) {
  const plugin = new AutoCorrectPlugin();
  plugin.settings = {
    exclusionList: [],
    abbreviations: ['e.g.', 'i.e.', 'etc.', 'vs.'],
    capitalizeListItem: false,
    capitalizeSentences: false,
    ...settings,
  };
  plugin.updateInternalSets();
  plugin.lastKeyWasEnter = enter;
  const editor = createEditor(text, cursor);
  plugin.handleEditorChange(editor);
  return { text: editor.text(), edits: editor.edits };
}

module.exports = { correct };
