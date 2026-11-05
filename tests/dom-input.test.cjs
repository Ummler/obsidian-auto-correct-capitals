const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<body></body>', { pretendToBeVisual: true });
for (const name of ['window', 'document', 'MutationObserver', 'HTMLElement', 'Node']) global[name] = dom.window[name];
global.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
global.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
const { EditorState, Prec, Transaction, StateEffect, Compartment } = require('@codemirror/state');
const { EditorView, keymap } = require('@codemirror/view');
const { markdown } = require('@codemirror/lang-markdown');
const { ensureSyntaxTree } = require('@codemirror/language');
const { history, undo } = require('@codemirror/commands');
const { editorExtension, correctionExtension, CorrectionPolicy, DEFAULT_SETTINGS,
  testEditorInfoField, resetTracking, AutoCorrectPlugin } = require('./helpers/runtime.cjs');
const policy = new CorrectionPolicy({ ...DEFAULT_SETTINGS });
test('plugin startup in an existing editor registers settings and command', async () => {
  const { view, type } = make(testEditorInfoField);
  const plugin = new AutoCorrectPlugin();
  plugin.registerEditorExtension = extension => view.dispatch({ effects: StateEffect.appendConfig.of(extension) });
  try {
    type('Existing ');
    await plugin.onload();
    assert.ok(plugin.tab);
    assert.equal(plugin.commands[0].id, 'toggle-auto-correction');
    type('HAllo ');
    assert.equal(view.state.doc.toString(), 'Existing Hallo ');
  } finally { view.destroy(); plugin.onunload(); }
});
test('repeated editor extension activation and removal does not retain word ownership', () => {
  const slot = new Compartment();
  const { view, type } = make([testEditorInfoField, slot.of([])]);
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      view.dispatch({ effects: slot.reconfigure(editorExtension(() => policy)) });
      type('HAllo ');
      view.dispatch({ effects: slot.reconfigure([]) });
      type('HAllo ');
    }
    assert.equal(view.state.doc.toString(), 'Hallo HAllo '.repeat(3));
  } finally { view.destroy(); }
});
function make(extensions) {
  const view = new EditorView({ parent: document.body,
    state: EditorState.create({ extensions: [markdown(), history(), extensions] }) });
  const type = text => {
    for (const char of text) {
      ensureSyntaxTree(view.state, view.state.doc.length, 1000);
      const pos = view.state.selection.main.head;
      view.dispatch({ changes: { from: pos, insert: char }, selection: { anchor: pos + char.length }, userEvent: 'input.type' });
    }
  };
  return { view, type };
}
test('expired parser retry cannot produce a late correction', async () => {
  let ready = false;
  const { view, type } = make(correctionExtension(() => policy, () => ready ? 'clear' : 'pending'));
  try {
    type('HAllo');
    view.dispatch({ changes: { from: 5, insert: ' ' }, selection: { anchor: 6 }, userEvent: 'input.type',
      annotations: Transaction.time.of(Date.now() - 1000) });
    ready = true; view.dispatch({}); await Promise.resolve();
    assert.equal(view.state.doc.toString(), 'HAllo ');
  } finally { view.destroy(); }
});
test('destroying a view cancels a queued correction', async () => {
  let ready = false;
  const { view, type } = make(correctionExtension(() => policy, () => ready ? 'clear' : 'pending'));
  type('HAllo '); ready = true; view.dispatch({}); view.destroy();
  await Promise.resolve(); assert.equal(view.state.doc.toString(), 'HAllo ');
});
test('Enter observer runs before a consuming high-priority CodeMirror keymap', () => {
  const { view, type } = make([testEditorInfoField, editorExtension(() => policy),
    Prec.highest(keymap.of([{ key: 'Enter', run(view) {
      const pos = view.state.selection.main.head;
      view.dispatch({ changes: { from: pos, insert: '\n' }, selection: { anchor: pos + 1 }, userEvent: 'input' });
      return true;
    } }]))]);
  try {
    type('HAllo');
    view.contentDOM.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    assert.equal(view.state.doc.toString(), 'Hallo\n');
  } finally { view.destroy(); }
});
test('parser progress retries only the unchanged pending word and joins default undo history', async () => {
  let ready = false;
  const { view, type } = make(correctionExtension(() => policy, () => ready ? 'clear' : 'pending'));
  try {
    type('HAllo '); assert.equal(view.state.doc.toString(), 'HAllo ');
    ready = true; view.dispatch({}); await Promise.resolve();
    assert.equal(view.state.doc.toString(), 'Hallo ');
    assert.equal(undo(view), true); assert.equal(view.state.doc.toString(), '');
  } finally { view.destroy(); }
});
test('identical selection updates preserve a pending correction', async () => {
  let ready = false;
  const { view, type } = make(correctionExtension(() => policy, () => ready ? 'clear' : 'pending'));
  try {
    type('WOrt ');
    view.dispatch({ selection: { anchor: view.state.selection.main.head } });
    ready = true; view.dispatch({}); await Promise.resolve();
    assert.equal(view.state.doc.toString(), 'Wort ');
  } finally { view.destroy(); }
});
for (const cancel of ['typing', 'selection', 'blur', 'protected', 'pause']) {
  test('deferred correction is cancelled safely by ' + cancel, async () => {
    let status = 'pending', active = policy;
    const { view, type } = make(correctionExtension(() => active, () => status));
    try {
      type('HAllo ');
      if (cancel === 'typing') type('x');
      if (cancel === 'selection') view.dispatch({ selection: { anchor: 0 } });
      if (cancel === 'blur') view.dispatch({ effects: resetTracking.of(null) });
      if (cancel === 'pause') active = new CorrectionPolicy(policy.settings, true);
      status = cancel === 'protected' ? 'protected' : 'clear';
      view.dispatch({}); await Promise.resolve();
      assert.equal(view.state.doc.toString(), 'HAllo ' + (cancel === 'typing' ? 'x' : ''));
    } finally { view.destroy(); }
  });
}
