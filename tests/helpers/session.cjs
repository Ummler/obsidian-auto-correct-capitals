const { EditorState } = require('@codemirror/state');
const { markdown } = require('@codemirror/lang-markdown');
const { ensureSyntaxTree } = require('@codemirror/language');
const { CorrectionPolicy, DEFAULT_SETTINGS, correctionExtension, isProtected } = require('./runtime.cjs');
function editor(doc = '', settings = {}, protection = isProtected, initialPath = 'Note.md') {
  let filePath = initialPath;
  let policy = new CorrectionPolicy({ ...DEFAULT_SETTINGS, ...settings });
  let state = EditorState.create({ doc, selection: { anchor: doc.length },
    extensions: [markdown(), require('@codemirror/commands').history(), correctionExtension(() => policy, protection, () => filePath)] });
  const apply = spec => {
    ensureSyntaxTree(state, state.doc.length, 1000);
    const tr = state.update(spec);
    state = tr.state;
    return tr;
  };
  return {
    get state() { return state; }, apply,
    configure(settings) { policy = new CorrectionPolicy({ ...policy.settings, ...settings }); apply({}); },
    pause(value) { policy = new CorrectionPolicy(policy.settings, value); apply({}); },
    setFilePath(path) { filePath = path; apply({}); },
    type(text) {
      for (const char of text) apply({ changes: { from: state.selection.main.head, insert: char },
        userEvent: 'input.type', selection: { anchor: state.selection.main.head + char.length } });
    },
    text: () => state.doc.toString(),
  };
}

module.exports = { editor };
