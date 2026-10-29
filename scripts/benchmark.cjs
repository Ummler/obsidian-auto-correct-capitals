const { performance } = require('node:perf_hooks');
const { gzipSync } = require('node:zlib');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { EditorState } = require('@codemirror/state');
const { markdown } = require('@codemirror/lang-markdown');
const { ensureSyntaxTree } = require('@codemirror/language');
const { CorrectionPolicy, DEFAULT_SETTINGS, correctionExtension, isProtected } = require('../tests/helpers/runtime.cjs');

const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * fraction)];
function measure(doc, enabled, expectedCorrection = enabled) {
  const policy = new CorrectionPolicy({ ...DEFAULT_SETTINGS, respectRepeatedSpelling: false });
  const start = performance.now();
  let state = EditorState.create({ doc, selection: { anchor: doc.length },
    extensions: [markdown(), enabled ? correctionExtension(() => policy, isProtected) : []] });
  const createMs = performance.now() - start;
  const letters = [], boundaries = [];
  let corrections = 0, parsePreparationMs = 0;
  for (let i = 0; i < 100; i++) {
    const wordStart = state.doc.length;
    for (const char of 'HAllo') {
      const pos = state.doc.length, now = performance.now();
      state = state.update({ changes: { from: pos, insert: char },
        selection: { anchor: pos + 1 }, userEvent: 'input.type' }).state;
      letters.push(performance.now() - now);
    }
    // Model an already-parsed viewport. Parsing is host work, deliberately
    // outside the timed plugin transaction; production never forces parsing.
    const parseStart = performance.now();
    assert.ok(ensureSyntaxTree(state, state.doc.length, 10000));
    parsePreparationMs += performance.now() - parseStart;
    const pos = state.doc.length, now = performance.now();
    state = state.update({ changes: { from: pos, insert: ' ' },
      selection: { anchor: pos + 1 }, userEvent: 'input.type' }).state;
    boundaries.push(performance.now() - now);
    const corrected = state.doc.sliceString(wordStart, wordStart + 5) === 'Hallo';
    if (corrected) corrections++;
    assert.equal(corrected, expectedCorrection);
  }
  return {
    createMs: +createMs.toFixed(3),
    letterP50Ms: +percentile(letters, .5).toFixed(4),
    letterP95Ms: +percentile(letters, .95).toFixed(4),
    boundaryP50Ms: +percentile(boundaries, .5).toFixed(4),
    boundaryP95Ms: +percentile(boundaries, .95).toFixed(4),
    corrections, parsePreparationMs: +parsePreparationMs.toFixed(3),
  };
}

const scenarios = [
  ['small', 'ordinary text\n', true],
  ['10000-lines', 'ordinary text in a note\n\n'.repeat(5000), true],
  ['50000-lines', 'ordinary text in a note\n\n'.repeat(25000), true],
  ['6000-math-delimiters', '$$\nx\n$$\n\n'.repeat(3000), true],
  ['100000-character-line', 'x'.repeat(100000) + ' ', false],
];
const report = { node: process.version, platform: process.platform,
  method: 'headless CodeMirror transactions; warm parsed viewport; no DOM/rendering; 500 letter and 100 boundary samples per case',
  scenarios: [] };
// Warm up code paths before collecting numbers.
measure('warmup\n', true);
for (const [name, doc, expected] of scenarios) {
  report.scenarios.push({ name, initialCharacters: doc.length,
    baseline: measure(doc, false, false), plugin: measure(doc, true, expected) });
}
const bundle = fs.readFileSync(require('node:path').join(__dirname, '../main.js'));
report.bundle = { bytes: bundle.length, gzipBytes: gzipSync(bundle).length };
console.log(JSON.stringify(report, null, 2));
