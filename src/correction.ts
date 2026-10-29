import { EditorState } from '@codemirror/state';
import { CorrectionPolicy, normalizeWord } from './settings';

export const MAX_CONTEXT = 4096;
export const WORD_CHAR = /^[\p{L}\p{M}'’]$/u;
export const LETTER = /^\p{L}$/u;
export const DELIMITER = /^[\s.,;:!?{}"')\]%]$/u;
const DOUBLE_CAPITALS = /^(\p{Lu}\p{M}*)(\p{Lu}\p{M}*)(\p{Ll})/u;
const LIST_PREFIX = /^[\t ]*(?:>[\t ]*)*(?:[-*+]|\d+[.)])[\t ]+(?:\[[ xX]\][\t ]+)?$/;

export function replacementFor(state: EditorState, from: number, to: number,
  policy: CorrectionPolicy): string | null {
  if (to - from > MAX_CONTEXT) return null;
  const word = state.doc.sliceString(from, to);
  if (!word || policy.exclusions.has(normalizeWord(word))) return null;
  const line = state.doc.lineAt(from);
  if (from - line.from > MAX_CONTEXT) return null;
  const prefix = state.doc.sliceString(line.from, from);
  let replacement = word.replace(DOUBLE_CAPITALS,
    (_, a: string, b: string, c: string) => a + b.toLowerCase() + c);
  const listStart = policy.settings.capitalizeListItem && LIST_PREFIX.test(prefix);
  const previous = prefix.trimEnd().split(/\s+/).pop()?.replace(/^[([{<"'“‘«]+/u, '');
  const sentenceStart = policy.settings.capitalizeSentences &&
    /(?:^|[.!?]\s+)$/.test(prefix) &&
    !(previous && policy.abbreviations.has(normalizeWord(previous)));
  if (listStart || sentenceStart) {
    const first = Array.from(replacement)[0];
    replacement = first.toUpperCase() + replacement.slice(first.length);
  }
  return replacement === word ? null : replacement;
}
