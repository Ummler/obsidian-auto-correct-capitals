import { EditorState, StateField, Text } from '@codemirror/state';

interface Context { yaml: boolean; math: boolean; fence: string }
interface Marker { line: number; raw: string; after: Context }
const EMPTY: Context = { yaml: false, math: false, fence: '' };
const markerText = (text: string): string => {
  if (text.length > 4096) return '';
  const stripped = text.replace(/^[\t ]*(?:>[\t ]*)*/, '');
  return /^(?:---|\.\.\.|\$\$)[\t ]*$/.test(stripped) || /^(?:`{3,}|~{3,})/.test(stripped)
    ? stripped : '';
};

function markersIn(doc: Text, first: number, last: number): Marker[] {
  const result: Marker[] = [];
  for (let line = first; line <= last; line++) {
    const raw = markerText(doc.line(line).text);
    if (raw) result.push({ line, raw, after: EMPTY });
  }
  return result;
}

function contextualize(markers: Marker[]): Marker[] {
  let context = EMPTY;
  return markers.map(marker => {
    const raw = marker.raw.trim();
    if (marker.line === 1 && raw === '---') context = { ...EMPTY, yaml: true };
    else if (context.yaml) {
      if (raw === '---' || raw === '...') context = EMPTY;
    } else if (context.fence) {
      if (new RegExp('^' + context.fence[0] + '{' + context.fence.length + ',}[\\t ]*$').test(raw)) context = EMPTY;
    } else if (context.math && raw !== '$$') {
      // Code-looking lines inside display math do not open code fences.
    } else if (/^(`{3,}|~{3,})/.test(raw)) {
      context = { ...EMPTY, fence: raw.match(/^(`+|~+)/)![0] };
    } else if (raw === '$$') context = { ...EMPTY, math: !context.math };
    return { ...marker, after: context };
  });
}

// Sparse delimiter-line metadata, not a second Markdown syntax tree. Build once
// on editor creation; ordinary letters reuse the very same snapshot. Only
// touched lines and delimiter entries are examined after structural changes.
export const blockContext = StateField.define<readonly Marker[]>({
  create: state => contextualize(markersIn(state.doc, 1, state.doc.lines)),
  update: (old, tr) => {
    if (!tr.docChanged) return old;
    let first = tr.startState.doc.lines, oldLast = 1, newLast = 1;
    tr.changes.iterChanges((from, to, _a, end) => {
      first = Math.min(first, tr.startState.doc.lineAt(from).number);
      oldLast = Math.max(oldLast, tr.startState.doc.lineAt(to).number);
      newLast = Math.max(newLast, tr.newDoc.lineAt(end).number);
    });
    const touched = markersIn(tr.newDoc, first, newLast);
    let low = 0, high = old.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (old[middle].line < first) low = middle + 1;
      else high = middle;
    }
    const hasRemoved = !!old[low] && old[low].line <= oldLast;
    const delta = tr.newDoc.lines - tr.startState.doc.lines;
    if (!delta && !touched.length && !hasRemoved) return old;
    return contextualize([
      ...old.filter(marker => marker.line < first), ...touched,
      ...old.filter(marker => marker.line > oldLast).map(marker => ({ ...marker, line: marker.line + delta })),
    ]);
  },
});

export function blockProtected(state: EditorState, pos: number): boolean {
  const markers = state.field(blockContext, false);
  if (!markers) return true;
  const line = state.doc.lineAt(pos).number;
  let low = 0, high = markers.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (markers[middle].line < line) low = middle + 1;
    else high = middle;
  }
  if (markers[low]?.line === line) return true;
  const context = low ? markers[low - 1].after : EMPTY;
  return context.yaml || context.math || !!context.fence;
}
