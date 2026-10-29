const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { buildSync } = require('esbuild');
const entry = path.join(__dirname, '../entry.ts');
const result = buildSync({
  entryPoints: [entry], bundle: true, write: false, platform: 'node',
  format: 'cjs', target: 'es2020',
  external: ['obsidian', '@codemirror/*', '@lezer/*'],
});
const compiled = { exports: {} };
const runtimeRequire = createRequire(entry);
const editorInfoField = runtimeRequire('@codemirror/state').StateField.define({
  create: () => ({ file: { path: 'Note.md' } }), update: value => value,
});
class Plugin {
  constructor() {
    this.extensions = []; this.commands = []; this.messages = [];
    this.app = { workspace: { containerEl: {
      addEventListener() { throw new Error('Global DOM listener must not be registered'); },
    } } };
  }
  async loadData() { return this.saved || {}; }
  async saveData(data) { this.saved = JSON.parse(JSON.stringify(data)); }
  registerEditorExtension(extension) { this.extensions.push(extension); }
  addSettingTab(tab) { this.tab = tab; }
  addStatusBarItem() { return { setText: text => { this.statusText = text; } }; }
  addCommand(command) { this.commands.push(command); }
}
vm.runInNewContext(result.outputFiles[0].text, {
  module: compiled, exports: compiled.exports,
  require: id => id === 'obsidian' ? {
    parseYaml: text => runtimeRequire('js-yaml').load(text), editorInfoField,
    Plugin, PluginSettingTab: class {}, Setting: class {}, Notice: class {},
  } : runtimeRequire(id),
  console, setTimeout, clearTimeout,
});
module.exports = { ...compiled.exports, testEditorInfoField: editorInfoField };
