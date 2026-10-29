const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compactReport } = require('../scripts/obsidian-compact-report.js');

test('compact report omits passed text, filler and unrelated raw events', () => {
  const result = compactReport({ counts: { PASS: 69, FAIL: 1 }, metadata: { settings: { capitalizeSentences: true } },
    results: [{ id: 'good', status: 'PASS', actual: 'PASSED_TEXT_TO_OMIT' },
      { id: 'bad', title: 'Cursor', status: 'FAIL', expected: 'Test ', actual: 'TEst ' }],
    fixtures: [{ case: 'perf-large', characters: 200000 }],
    events: [{ case: 'good', kind: 'input', data: 'UNRELATED_EVENT' },
      { case: 'bad', kind: 'transaction', changes: [{ inserted: 'FILLER_TO_OMIT' }] },
      { case: 'bad', kind: 'input', data: 't' }],
  }, 'source-events.json');
  assert.ok(result.includes('"TEst "')); assert.ok(result.includes('"Test "'));
  for (const excluded of ['PASSED_TEXT_TO_OMIT', 'UNRELATED_EVENT', 'FILLER_TO_OMIT']) assert.ok(!result.includes(excluded));
  assert.ok(result.includes('"PASS": 69'));
});
test('performance measurements survive successful functional assertions', () => {
  const result = compactReport({ results: [{ id: 'perf-reference', status: 'PASS', actual: 'LONG_BODY' }],
    timings: { 'perf-reference/active': { sent: 48, sendToApplied: { p95: 9 } }, 'basic/functional': { sent: 6 } },
    measurements: [{ case: 'perf-reference', phase: 'active', documentCharacters: 222000, documentLines: 8000 }],
  }, 'source');
  assert.ok(result.includes('222000')); assert.ok(result.includes('"p95": 9'));
  assert.ok(!result.includes('LONG_BODY')); assert.ok(!result.includes('basic/functional'));
});
test('failure traces and unexpectedly huge actual text are explicitly bounded', () => {
  const result = compactReport({ results: [{ id: 'bad', status: 'FAIL', actual: 'x'.repeat(100000) }],
    events: Array.from({ length: 1000 }, (_, i) => ({ case: 'bad', kind: 'input', data: 'e' + i })),
  }, 'source');
  assert.ok(result.includes('"truncated": true')); assert.ok(result.includes('32 von 1000'));
  assert.ok(!result.includes('"data":"e1"')); assert.ok(result.includes('"data":"e999"'));
  assert.ok(result.length < 10000);
});
test('invalid diagnostics are rejected rather than reporting success', () => {
  assert.throws(() => compactReport({}, 'source'), /results fehlt/);
});
