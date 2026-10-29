import { Annotation, EditorState, Extension, StateField, Transaction } from '@codemirror/state';
import { CorrectionPolicy } from './settings';
import { DELIMITER, LETTER, MAX_CONTEXT, replacementFor, WORD_CHAR } from './correction';

export const typedEnter = Annotation.define<boolean>();
export const blockedInput = Annotation.define<boolean>();
export const ownCorrection = Annotation.define<boolean>();
interface Run { from: number; to: number }
interface Decision { run?: Run; correction?: { from: number; to: number; insert: string } }

function decide(tr: Transaction, run?: Run): Decision {
  if (!tr.docChanged) return { run: tr.selection ? undefined : run };
  if (tr.annotation(blockedInput) || tr.startState.selection.ranges.length !== 1 ||
    !tr.startState.selection.main.empty) return {};
  const event = tr.annotation(Transaction.userEvent);
  const enter = tr.annotation(typedEnter) && event === 'input';
  if (event !== 'input.type' && !enter) return {};
  const changes: { from: number; to: number; end: number; text: string }[] = [];
  tr.changes.iterChanges((from, to, _a, end, text) => {
    changes.push({ from, to, end, text: text.toString() });
  });
  if (changes.length !== 1) return {};
  const change = changes[0];
  if (change.from !== change.to || change.from !== tr.startState.selection.main.head) return {};
  const points = Array.from(change.text);
  if (!enter && points.length !== 1) return {};
  const char = points[0];
  if (!char) return {};
  if (WORD_CHAR.test(char)) {
    if (run && run.to === change.from && change.end - run.from <= MAX_CONTEXT) {
      return { run: { from: run.from, to: change.end } };
    }
    // A new run must start at a word boundary, never in an existing word.
    const previous = tr.startState.doc.sliceString(Math.max(0, change.from - 2), change.from);
    const last = Array.from(previous).pop();
    if (LETTER.test(char) && !(last && WORD_CHAR.test(last))) {
      return { run: { from: change.from, to: change.end } };
    }
  }
  if (run && run.to === change.from && DELIMITER.test(char)) {
    return { correction: { from: run.from, to: run.to, insert: '' } };
  }
  return {};
}

export function correctionExtension(getPolicy: () => CorrectionPolicy,
  protectedAt: (state: EditorState, from: number, to: number) => boolean): Extension {
  const tracking = StateField.define<Run | undefined>({
    create: () => undefined,
    update: (run, tr) => decide(tr, run).run,
  });
  return [tracking, EditorState.transactionFilter.of(tr => {
    const candidate = decide(tr, tr.startState.field(tracking)).correction;
    if (!candidate) return tr;
    const replacement = replacementFor(tr.startState, candidate.from, candidate.to, getPolicy());
    if (!replacement || protectedAt(tr.startState, candidate.from, candidate.to)) return tr;
    return [tr, {
      sequential: true,
      changes: { from: candidate.from, to: candidate.to, insert: replacement },
      annotations: ownCorrection.of(true),
    }];
  })];
}
