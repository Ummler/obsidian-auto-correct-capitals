const { EditorState } = require('@codemirror/state');
const { markdown } = require('@codemirror/lang-markdown');
const { ensureSyntaxTree } = require('@codemirror/language');
const { CorrectionPolicy, DEFAULT_SETTINGS, correctionExtension, isProtected } = require('./runtime.cjs');
function editor(doc = '', settings = {}, protection = isProtected) {
  let policy = new CorrectionPolicy({ ...DEFAULT_SETTINGS, ...settings });
  let state = EditorState.create({ doc, selection: { anchor: doc.length },
    extensions: [markdown(), require('@codemirror/commands').history(), correctionExtension(() => policy, protection)] });
  const apply = spec => {
    ensureSyntaxTree(state, state.doc.length, 1000);
    const tr = state.update(spec);
    state = tr.state;
    return tr;
  };
  return {
    get state() { return state; }, apply,
    configure(settings) { policy = new CorrectionPolicy({ ...policy.settings, ...settings }); apply({}); },
    type(text) {
      for (const char of text) apply({ changes: { from: state.selection.main.head, insert: char },
        userEvent: 'input.type', selection: { anchor: state.selection.main.head + char.length } });
    },
    text: () => state.doc.toString(),
  };
}

module.exports = { editor };
