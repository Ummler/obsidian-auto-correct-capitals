import { EditorState } from '@codemirror/state';
import { syntaxTree, syntaxTreeAvailable } from '@codemirror/language';
import { MAX_CONTEXT } from './correction';

// Never force synchronous parsing on the input path. The caller only reaches
// this function when a completed word would actually change.
export function isProtected(state: EditorState, from: number, to: number): boolean {
  if (!syntaxTreeAvailable(state, to)) return true;
  const tree = syntaxTree(state);
  for (let node = tree.resolveInner(from, 1); node; node = node.parent!) {
    if (/code|math|frontmatter|hmd-frontmatter/i.test(node.name)) return true;
  }
  let protectedNode = false;
  tree.iterate({ from, to, enter(node) {
    if (/code|math|frontmatter/i.test(node.name)) protectedNode = true;
  } });
  if (protectedNode) return true;
  const line = state.doc.lineAt(from);
  if (line.length > MAX_CONTEXT) return true;
  const text = line.text;
  const pos = from - line.from;
  // Syntax extensions differ between Obsidian and the standalone Markdown
  // parser. Conservatively cover math and unfinished inline code locally.
  let ticks = 0, dollars = 0;
  for (let i = 0; i < pos; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (text[i] === '`') ticks++;
    if (text[i] === '$') dollars++;
  }
  if (ticks % 2 || dollars % 2) return true;
  const urls = /https?:[^\s<>"`]*/gi;
  let match: RegExpExecArray | null;
  while ((match = urls.exec(text))) {
    if (match.index < to - line.from && match.index + match[0].length > pos) return true;
  }
  // Bounded fallback for YAML and math in parser configurations without those
  // extensions. Unknown multiline context is skipped, not scanned unboundedly.
  const header = state.doc.sliceString(0, Math.min(state.doc.length, MAX_CONTEXT));
  if (from < MAX_CONTEXT) {
    const mathMarkers = state.doc.sliceString(0, from).match(/^\$\$[\t ]*$/gm);
    if (mathMarkers && mathMarkers.length % 2) return true;
  }
  if (/^---\r?\n/.test(header)) {
    const end = /^---[\t ]*$/gm;
    end.lastIndex = 4;
    const close = end.exec(header);
    if (!close || from <= close.index + close[0].length) return true;
  }
  return false;
}
