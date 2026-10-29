import { EditorState, StateField } from '@codemirror/state';
import { parseYaml } from 'obsidian';
import { blockContext } from './blocks';

interface HeaderPolicy { disabled: boolean; end: number; present: boolean }
function readHeader(state: EditorState): HeaderPolicy {
  const start = state.doc.sliceString(0, 4);
  if (start !== '---' && start !== '---\n') return { disabled: false, end: 3, present: false };
  const close = state.field(blockContext).find(marker =>
    marker.line > 1 && /^(---|\.\.\.)[\t ]*$/.test(marker.raw));
  if (!close) return { disabled: true, end: state.doc.length, present: true };
  const endLine = state.doc.line(close.line);
  // Invalid, unfinished or extremely large headers conservatively opt out.
  if (endLine.to > 65536) return { disabled: true, end: endLine.to, present: true };
  try {
    const header = parseYaml(state.doc.sliceString(state.doc.line(1).to + 1, endLine.from));
    return { disabled: header?.['auto-correct-capitals'] === false, end: endLine.to, present: true };
  } catch { return { disabled: true, end: endLine.to, present: true }; }
}

export const headerPolicy = StateField.define<HeaderPolicy>({
  create: readHeader,
  update: (old, tr) => tr.docChanged && tr.changes.touchesRange(0, old.end)
    ? readHeader(tr.state) : old,
});
