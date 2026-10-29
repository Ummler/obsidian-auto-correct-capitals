import { EditorState } from '@codemirror/state';
import { syntaxTree, syntaxTreeAvailable } from '@codemirror/language';
import { MAX_CONTEXT } from './correction';
import { blockProtected } from './blocks';

const protectedNode = (name: string): boolean =>
  /code|math|frontmatter/i.test(name) || /^(URL|LinkTitle|LinkLabel|Autolink)$/.test(name);

// This function never forces parsing or reads a prefix of the document.
export function isProtected(state: EditorState, from: number, to: number): boolean {
  if (blockProtected(state, from) || !syntaxTreeAvailable(state, to)) return true;
  const tree = syntaxTree(state);
  for (let node = tree.resolveInner(from, 1); node; node = node.parent!) {
    if (protectedNode(node.name)) return true;
  }
  let protectedChild = false;
  tree.iterate({ from, to, enter(node) {
    if (protectedNode(node.name)) protectedChild = true;
  } });
  if (protectedChild) return true;
  const line = state.doc.lineAt(from);
  // Skip pathological long lines rather than run unbounded regexes/scanners.
  if (line.length > MAX_CONTEXT) return true;
  // Include a bounded lookbehind for unfinished multiline link destinations
  // and titles. Never copy the document prefix or an unbounded paragraph.
  let contextStart = Math.max(0, line.to - MAX_CONTEXT);
  let text = state.doc.sliceString(contextStart, line.to);
  const paragraphBreak = text.lastIndexOf('\n\n', from - contextStart);
  if (paragraphBreak >= 0) {
    contextStart += paragraphBreak + 2;
    text = text.slice(paragraphBreak + 2);
  }
  return localProtected(text, from - contextStart, to - contextStart);
}

export function localProtected(text: string, from: number, to: number): boolean {
  const overlaps = (a: number, b: number) => a < to && b > from;
  // Protect completed and partially entered schemes and email addresses.
  for (const pattern of [/\b(?:https?|mailto):[^\s<>"`]*/gi,
    /[^\s<>()[\]{}"'`]+/g]) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      if ((match[0].includes('@') || /^(?:https?|mailto):/i.test(match[0])) &&
        overlaps(match.index, match.index + match[0].length)) return true;
    }
  }
  // Reference definitions contain a destination and optional title.
  const references = /(?:^|\n)[ \t]{0,3}\[[^\]\n]+\]:[ \t]*/g;
  let reference: RegExpExecArray | null;
  while ((reference = references.exec(text))) {
    const end = text.indexOf('\n', references.lastIndex);
    if (overlaps(reference.index, end < 0 ? text.length : end)) return true;
  }

  let code = 0, math = false;
  for (let i = 0; i < text.length;) {
    if (text[i] === '\\') { i += 2; continue; }
    if (text[i] === '`') {
      let end = i + 1;
      while (text[end] === '`') end++;
      if (!code) code = end - i;
      else if (code === end - i) code = 0;
      i = end; continue;
    }
    if (code) { if (i >= from && i < to) return true; i++; continue; }
    if (text[i] === '$') { math = !math; i++; continue; }
    if (math && i >= from && i < to) return true;

    if (text.slice(i, i + 2) === '[[') {
      let end = i + 2, alias = -1;
      while (end < text.length && text.slice(end, end + 2) !== ']]') {
        if (text[end] === '\\') { end += 2; continue; }
        if (text[end] === '|' && alias < 0) alias = end;
        end++;
      }
      if (overlaps(i, alias < 0 ? end : alias)) return true;
      i = Math.min(text.length, end + 2); continue;
    }
    if (text.slice(i, i + 2) === '](') {
      let end = i + 2, depth = 1;
      for (; end < text.length && depth; end++) {
        if (text[end] === '\\') { end++; continue; }
        if (text[end] === '(') depth++;
        if (text[end] === ')') depth--;
      }
      if (overlaps(i + 2, end)) return true;
      i = end; continue;
    }
    if (text.slice(i, i + 2) === '][') {
      let end = i + 2;
      while (end < text.length && text[end] !== ']') end++;
      if (overlaps(i + 2, end)) return true;
      i = end + 1; continue;
    }
    i++;
  }
  return false;
}
