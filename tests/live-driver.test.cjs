const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cases, optionsFor, runSuite, randomMarkdown, summarizeMeasurements } = require('../scripts/obsidian-live-test.js');

const fast = { characterDelayMs: 0, settleMs: 0, casePauseMs: 0, startDelayMs: 0,
  stressSettleMs: 0, performanceDelayMs: 0, includeStress: false };
function host() {
  let text = '', cursor = 0, snapshotStart = 0, redoText = '';
  const sent = [], checkpoints = [], reports = [];
  return {
    sent, checkpoints, reports,
    assertActive() {}, wait: async () => {},
    beginCase() { text = ''; cursor = 0; snapshotStart = 0; },
    setup(action) { text += action.value; cursor = text.length; if (action.omit) snapshotStart = cursor; },
    patch(action) { text = text.slice(0, action.from) + action.value + text.slice(action.to); cursor = text.length; },
    setPaused(value) { this.paused = value; },
    frontmatter() {},
    shortcut(name) {
      if (name === 'undo') { redoText = text; text = ''; cursor = 0; }
      else { text = redoText; cursor = text.length; }
    },
    sendCharacter(char) {
      assert.equal(Array.from(char).length, 1, 'exactly one code point per input event');
      sent.push(char); text = text.slice(0, cursor) + char + text.slice(cursor); cursor += char.length;
    },
    sendKey(key) {
      if (key === 'Left') cursor = Math.max(0, cursor - 1);
      else if (key === 'Backspace') { text = text.slice(0, Math.max(0, cursor - 1)) + text.slice(cursor); cursor = Math.max(0, cursor - 1); }
      else if (key === 'Return') { text = text.slice(0, cursor) + '\n' + text.slice(cursor); cursor++; }
      else throw new Error('Unexpected key ' + key);
    },
    snapshot: () => text.slice(snapshotStart),
    checkpoint: value => checkpoints.push(value),
    report: value => reports.push(value),
  };
}
test('live driver sends single characters and reports real failures without a plugin', async () => {
  const h = host(), control = { results: [] };
  const results = await runSuite(h, {}, fast, control);
  assert.ok(h.sent.length > 100);
  const basic = results.find(result => result.id === 'basic');
  assert.equal(basic.status, 'FAIL'); assert.equal(basic.actual, 'HAllo ');
  assert.equal(results.find(result => result.id === 'cursor-one-space').actual, 'Wort TEst Wort HAllo');
  assert.equal(results.find(result => result.id === 'cursor-two-spaces').actual, 'Wort TEst  Wort HAllo');
  assert.equal(results.filter(result => result.id === 'comma').length, 2);
  assert.equal(results.find(result => result.id === 'comma' && result.status !== 'INFO').status, 'FAIL');
  assert.equal(results.find(result => result.id === 'unicode-sentence').status, 'SKIP');
  assert.equal(control.results, results);
});
test('live driver stops before another character after focus loss and retains results', async () => {
  const h = host(), control = { results: [] };
  let calls = 0;
  h.assertActive = () => { if (++calls > 20) throw new Error('focus lost'); };
  await assert.rejects(runSuite(h, {}, fast, control), /focus lost/);
  const count = h.sent.length; await Promise.resolve(); assert.equal(h.sent.length, count);
  assert.ok(control.results.length > 0);
});
test('Escape/stop flag prevents native input', async () => {
  const h = host();
  await assert.rejects(runSuite(h, {}, fast, { stopped: true, reason: 'Escape' }), /Escape/);
  assert.equal(h.sent.length, 0);
});
test('all functional groups are enabled when their settings are enabled', () => {
  const selected = cases({ capitalizeListItem: true, capitalizeSentences: true, abbreviations: ['i.e.'] }, fast);
  assert.equal(selected.filter(item => item.skip).length, 0);
  assert.ok(selected.some(item => item.id === 'retry'));
});
test('random Markdown is reproducible and all generated fences are closed', () => {
  const a = randomMarkdown(80, 731), b = randomMarkdown(80, 732);
  assert.equal(a, randomMarkdown(80, 731)); assert.notEqual(a, b);
  assert.equal((a.match(/^```/gm) || []).length % 2, 0);
  assert.equal((a.match(/^\$\$/gm) || []).length % 2, 0);
  assert.ok(a.includes('[Verweis]')); assert.ok(a.length > 5000);
});
test('stress fixtures are inserted programmatically and excluded from snapshots', async () => {
  const h = host(), setups = [], original = h.setup;
  h.setup = action => { setups.push(action.value.length); original(action); };
  const results = await runSuite(h, {}, { ...fast, includeFunctional: false, includeStress: true,
    stressParagraphs: 30, stressBlocks: 3, performanceWords: 2 }, { results: [] });
  assert.ok(setups.some(length => length > 12000));
  assert.ok(h.sent.length < 200, 'filler must never be typed character by character');
  const result = results.find(item => item.id === 'perf-large-document' && item.checkpoint === 'Aktiv');
  assert.equal(result.actual, 'HAllo HAllo ');
  assert.equal(result.status, 'FAIL', 'without a plugin, active correction must not pass');
  assert.equal(results.find(item => item.id === 'perf-large-document' && item.checkpoint !== 'Aktiv').status, 'PASS');
  assert.equal(h.paused, false);
});
test('measurement summary includes missing samples rather than inventing latency', () => {
  const summary = summarizeMeasurements([
    { character: 'H', trusted: true, appliedMs: 2, nextFrameMs: 15, viewUpdateMs: 1 },
    { character: ' ', trusted: true, appliedMs: 8, nextFrameMs: 20, viewUpdateMs: 3 },
    { character: 'x' },
  ]);
  assert.equal(summary.sent, 3); assert.equal(summary.withoutMatchedTransaction, 1);
  assert.equal(summary.wordBoundaryToApplied.p50, 8);
  assert.equal(summary.sendToApplied.max, 8);
  assert.equal(summarizeMeasurements([]).sendToApplied, null);
});
test('stress options have bounded sizes and can be disabled', () => {
  assert.throws(() => optionsFor({ stressParagraphs: 999999 }), /Ungültig/);
  assert.throws(() => optionsFor({ longLineLength: 4096 }), /Ungültig/);
  assert.throws(() => optionsFor({ comparePaused: 'yes' }), /Ungültig/);
  assert.equal(cases({}, { includeFunctional: false, includeStress: false }).length, 0);
});
test('configured mixed-capital exclusions are exercised without changing settings', () => {
  const selected = cases({ exclusionList: ['PRs', 'MRs'] }, fast);
  assert.ok(selected.some(item => item.id === 'exclusion-PRs'));
  assert.ok(selected.some(item => item.id === 'exclusion-MRs'));
});
test('paused comparison retains the long-line context and separates fixture text', () => {
  const item = cases({}, { includeFunctional: false, longLineLength: 5000 }).find(item => item.id === 'perf-over-budget-line');
  const fixtures = item.actions.filter(action => action.type === 'setup');
  assert.equal(fixtures[0].value, 'x'.repeat(5000) + ' ');
  assert.equal(fixtures[1].value, '\n' + fixtures[0].value);
  assert.ok(fixtures.every(action => action.omit));
});
test('protection cases check a word boundary before closing the protected range', () => {
  for (const id of ['math-block', 'double-backtick', 'fence-```javascript']) {
    const item = cases({}, fast).find(item => item.id === id);
    const firstCheck = item.actions.findIndex(action => action.type === 'check');
    assert.ok(item.actions.slice(0, firstCheck).some(action => action.type === 'text' && action.value.endsWith(' ')));
    assert.ok(item.actions.slice(firstCheck + 1).some(action => action.type === 'setup'), 'range must be closed before subsequent cases');
  }
});
test('invalid timing values are rejected before creating a note', () => {
  assert.throws(() => optionsFor({ characterDelayMs: -1 }), /Ungültig/);
  assert.throws(() => optionsFor({ settleMs: NaN }), /Ungültig/);
});
