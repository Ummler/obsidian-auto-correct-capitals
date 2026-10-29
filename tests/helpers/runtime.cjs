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
vm.runInNewContext(result.outputFiles[0].text, {
  module: compiled, exports: compiled.exports,
  require: id => id === 'obsidian' ? {
    parseYaml: text => runtimeRequire('js-yaml').load(text), editorInfoField,
  } : runtimeRequire(id),
  console, setTimeout, clearTimeout,
});
module.exports = compiled.exports;
