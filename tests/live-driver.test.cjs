const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cases, optionsFor, runSuite } = require('../scripts/obsidian-live-test.js');

const fast = { characterDelayMs: 0, settleMs: 0, casePauseMs: 0, startDelayMs: 0 };
function host() {
  let text = '', cursor = 0;
  const sent = [], checkpoints = [], reports = [];
  return {
    sent, checkpoints, reports,
    assertActive() {}, wait: async () => {},
    beginCase() { text = ''; cursor = 0; },
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
    snapshot: () => text,
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
  const selected = cases({ capitalizeListItem: true, capitalizeSentences: true, abbreviations: ['i.e.'] });
  assert.equal(selected.filter(item => item.skip).length, 0);
  assert.ok(selected.some(item => item.id === 'retry'));
});
test('invalid timing values are rejected before creating a note', () => {
  assert.throws(() => optionsFor({ characterDelayMs: -1 }), /Ungültig/);
  assert.throws(() => optionsFor({ settleMs: NaN }), /Ungültig/);
});
