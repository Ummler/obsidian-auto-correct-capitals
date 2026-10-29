const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EditorState } = require('@codemirror/state');
const { EditorView } = require('@codemirror/view');
const { markdown } = require('@codemirror/lang-markdown');
const { ensureSyntaxTree } = require('@codemirror/language');
const { editorExtension, CorrectionPolicy, DEFAULT_SETTINGS, testEditorInfoField,
  AutoCorrectPlugin, loadSettings, resetTracking } = require('./helpers/runtime.cjs');

function registeredEditor(factory) {
  let handlers;
  const original = EditorView.domEventObservers;
  let extension;
  try {
    EditorView.domEventObservers = value => { handlers = value; return original(value); };
    extension = factory();
  } finally { EditorView.domEventObservers = original; }
  const view = {
    state: EditorState.create({ extensions: [markdown(), testEditorInfoField, extension] }),
    dispatch(spec) {
      ensureSyntaxTree(this.state, this.state.doc.length, 1000);
      this.state = this.state.update(spec).state;
    },
  };
  const type = text => {
    for (const char of text) {
      handlers.beforeinput({ inputType: 'insertText', isComposing: false }, view);
      const pos = view.state.selection.main.head;
      view.dispatch({ changes: { from: pos, insert: char }, selection: { anchor: pos + char.length }, userEvent: 'input.type' });
    }
  };
  return { view, handlers, type, text: () => view.state.doc.toString() };
}
const make = () => registeredEditor(() => editorExtension(() => newPolicy));
const newPolicy = new CorrectionPolicy({ ...DEFAULT_SETTINGS });

test('registered beforeinput gate rejects replacement input mislabeled as typing', () => {
  const e = make();
  e.handlers.beforeinput({ inputType: 'insertReplacementText', isComposing: false }, e.view);
  e.view.dispatch({ changes: { from: 0, insert: 'H' }, selection: { anchor: 1 }, userEvent: 'input.type' });
  e.type('Allo '); assert.equal(e.text(), 'HAllo ');
});
test('registered Enter evidence reaches correction filter before it runs', () => {
  const e = make(); e.type('HAllo');
  e.handlers.keydown({ key: 'Enter', isComposing: false }, e.view);
  e.view.dispatch({ changes: { from: 5, insert: '\n' }, selection: { anchor: 6 }, userEvent: 'input' });
  assert.equal(e.text(), 'Hallo\n');
});
test('blur clears typed ownership', () => {
  const e = make(); e.type('HAllo'); e.handlers.blur({}, e.view); e.type(' ');
  assert.equal(e.text(), 'HAllo ');
});
test('composition start clears typed ownership', () => {
  const e = make(); e.type('HAllo'); e.handlers.compositionstart({}, e.view); e.type(' ');
  assert.equal(e.text(), 'HAllo ');
});
test('Enter evidence expires on keyup without a corresponding transaction', () => {
  const e = make(); e.type('HAllo');
  e.handlers.keydown({ key: 'Enter', isComposing: false }, e.view);
  e.handlers.keyup({ key: 'Enter' }, e.view);
  e.view.dispatch({ changes: { from: 5, insert: '\n' }, userEvent: 'input' });
  assert.equal(e.text(), 'HAllo\n');
});
test('replacement evidence survives the beforeinput-to-DOMObserver microtask gap', async () => {
  const e = make();
  e.handlers.beforeinput({ inputType: 'insertReplacementText', isComposing: false }, e.view);
  await Promise.resolve();
  e.view.dispatch({ changes: { from: 0, insert: 'H' }, selection: { anchor: 1 }, userEvent: 'input.type' });
  e.type('Allo '); assert.equal(e.text(), 'HAllo ');
});
test('plugin registers editor-owned hooks and session-only pause command', async () => {
  const plugin = new AutoCorrectPlugin(); await plugin.onload();
  assert.equal(plugin.extensions.length, 1);
  assert.equal(plugin.commands[0].id, 'toggle-auto-correction');
  plugin.commands[0].callback(); assert.equal(plugin.statusText, 'AutoCorrect: paused');
  await plugin.saveSettings(); assert.equal('paused' in plugin.saved, false);
  plugin.commands[0].callback(); assert.equal(plugin.statusText, 'AutoCorrect: on');
});
test('pause command gates the actual extension registered by the plugin', async () => {
  const plugin = new AutoCorrectPlugin(); await plugin.onload();
  let state = EditorState.create({ extensions: [markdown(), testEditorInfoField, plugin.extensions] });
  const type = text => {
    for (const char of text) {
      ensureSyntaxTree(state, state.doc.length, 1000);
      const pos = state.selection.main.head;
      state = state.update({ changes: { from: pos, insert: char }, selection: { anchor: pos + char.length }, userEvent: 'input.type' }).state;
    }
  };
  plugin.commands[0].callback(); type('HAllo ');
  plugin.commands[0].callback(); type('HAllo ');
  assert.equal(state.doc.toString(), 'HAllo Hallo ');
});
test('optional diagnostic observers cannot break typing and are cleared on unload', async () => {
  const plugin = new AutoCorrectPlugin(); await plugin.onload();
  const reasons = [];
  plugin.observeCorrections(() => { throw new Error('Observer failure'); });
  const stop = plugin.observeCorrections(event => reasons.push(event.reason));
  let state = EditorState.create({ extensions: [markdown(), testEditorInfoField, plugin.extensions] });
  const type = text => {
    for (const char of text) {
      ensureSyntaxTree(state, state.doc.length, 1000);
      const pos = state.selection.main.head;
      state = state.update({ changes: { from: pos, insert: char }, selection: { anchor: pos + char.length }, userEvent: 'input.type' }).state;
    }
  };
  type('HAllo '); assert.equal(state.doc.toString(), 'Hallo ');
  assert.ok(reasons.includes('applied'));
  plugin.onunload(); const count = reasons.length;
  type('TEst '); assert.equal(reasons.length, count);
  stop(); stop();
});
test('settings migration validates types and keeps old options', () => {
  const settings = loadSettings({ capitalizeListItem: true, exclusionList: [' NB ', 42],
    abbreviations: null, excludedFolders: ['Archive'], respectRepeatedSpelling: 'false' });
  assert.equal(settings.capitalizeListItem, true);
  assert.equal(settings.exclusionList.join(), 'NB');
  assert.equal(settings.abbreviations.includes('i.e.'), true);
  assert.equal(settings.respectRepeatedSpelling, true);
});
test('resuming resets a previously started word and accepts a fresh word', () => {
  const { editor } = require('./helpers/session.cjs');
  const e = editor(); e.type('HAllo'); e.pause(true); e.type(' '); e.pause(false);
  e.type('HAllo '); assert.equal(e.text(), 'HAllo Hallo ');
});
test('focus reset clears deliberate-retry exception', () => {
  const { editor } = require('./helpers/session.cjs');
  const e = editor(); e.type('HAllo ');
  e.apply({ effects: resetTracking.of(null) });
  e.apply({ changes: { from: 0, to: 6 }, selection: { anchor: 0 }, userEvent: 'delete.backward' });
  e.type('HAllo '); assert.equal(e.text(), 'Hallo ');
});
