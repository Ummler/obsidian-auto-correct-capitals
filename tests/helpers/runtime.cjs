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
vm.runInNewContext(result.outputFiles[0].text, {
  module: compiled, exports: compiled.exports, require: createRequire(entry),
  console, setTimeout, clearTimeout,
});
module.exports = compiled.exports;
