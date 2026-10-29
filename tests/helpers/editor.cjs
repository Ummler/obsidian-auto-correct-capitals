// Fixed-document regression tests use the same production rules as the editor.
// Input ownership and event handling are covered in input.test.cjs.
const { EditorState } = require('@codemirror/state');
const { markdown } = require('@codemirror/lang-markdown');
const { ensureSyntaxTree } = require('@codemirror/language');
const { CorrectionPolicy, DEFAULT_SETTINGS, replacementFor, isProtected } = require('./runtime.cjs');
function correct(text, settings = {}) {
  const state = EditorState.create({ doc: text, extensions: [markdown()] });
  ensureSyntaxTree(state, state.doc.length, 1000);
  const policy = new CorrectionPolicy({ ...DEFAULT_SETTINGS, ...settings });
  const words = /\p{L}[\p{L}\p{M}'’]*(?=[\s.,;:!?{}"')\]%])/gu;
  const edits = [];
  let match;
  while ((match = words.exec(text))) {
    const from = match.index, to = from + match[0].length;
    const insert = replacementFor(state, from, to, policy);
    if (insert && !isProtected(state, from, to)) edits.push({ from, to, insert });
  }
  for (const edit of [...edits].reverse()) text = text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
  return { text, edits };
}
module.exports = { correct };
