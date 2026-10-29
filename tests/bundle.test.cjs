const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { buildSync } = require('esbuild');

test('production bundle contains no CodeMirror parser or testing runtime', () => {
  const result = buildSync({ entryPoints: [path.join(__dirname, '../main.ts')], bundle: true,
    write: false, metafile: true, format: 'cjs', platform: 'node', target: 'es2018',
    external: ['obsidian', '@codemirror/*', '@lezer/*'] });
  const inputs = Object.keys(result.metafile.inputs);
  assert.ok(inputs.every(file => !file.includes('node_modules') && !file.includes('tests/')));
  const external = Object.values(result.metafile.outputs)[0].imports;
  assert.ok(external.some(item => item.path === '@codemirror/state' && item.external));
  assert.ok(external.some(item => item.path === '@codemirror/language' && item.external));
  assert.ok(external.some(item => item.path === 'obsidian' && item.external));
});
