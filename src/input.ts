import { Annotation, EditorState, Extension, StateField, Transaction } from '@codemirror/state';
import { CorrectionPolicy } from './settings';
import { DELIMITER, LETTER, MAX_CONTEXT, replacementFor, WORD_CHAR } from './correction';
import { blockContext } from './blocks';
import { headerPolicy } from './exclusions';

export const typedEnter = Annotation.define<boolean>();
export const blockedInput = Annotation.define<boolean>();
export const ownCorrection = Annotation.define<boolean>();
interface Retry extends Run { original: string }
const correctedWord = Annotation.define<Retry>();
interface Run { from: number; to: number; tail?: number }
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
    if (run && !run.tail && run.to === change.from && change.end - run.from <= MAX_CONTEXT) {
      return { run: { from: run.from, to: change.end } };
    }
    // A new run must start at a word boundary, never in an existing word.
    const previous = tr.startState.doc.sliceString(Math.max(0, change.from - 2), change.from);
    const last = Array.from(previous).pop();
    if (LETTER.test(char) && !(last && WORD_CHAR.test(last))) {
      return { run: { from: change.from, to: change.end } };
    }
  }
  // A dot or colon might still become an email address or URL. Wait for a
  // definite boundary instead of changing the prefix of an unfinished token.
  if (run && (run.tail || run.to) === change.from && /^[.,;:!?]$/.test(char)) {
    return { run: { ...run, tail: change.end } };
  }
  if (run && (run.tail || run.to) === change.from && DELIMITER.test(char)) {
    return { correction: { from: run.from, to: run.to, insert: '' } };
  }
  return {};
}

export function correctionExtension(getPolicy: () => CorrectionPolicy,
  protectedAt: (state: EditorState, from: number, to: number) => boolean,
  getFilePath: (state: EditorState) => string | null = () => 'Note.md'): Extension {
  const eligibility = StateField.define<{ path: string | null; policy: CorrectionPolicy; allowed: boolean }>({
    create: state => {
      const path = getFilePath(state), policy = getPolicy();
      return { path, policy, allowed: path !== null && !policy.excludesPath(path) };
    },
    update: (old, tr) => {
      const path = getFilePath(tr.startState), policy = getPolicy();
      return path === old.path && policy === old.policy ? old
        : { path, policy, allowed: path !== null && !policy.excludesPath(path) };
    },
  });
  const enabled = (state: EditorState) => {
    const file = state.field(eligibility);
    return file.allowed && file.path === getFilePath(state) && file.policy === getPolicy() &&
      !state.field(headerPolicy).disabled;
  };
  interface Tracking { run?: Run; retry?: Retry; policy: CorrectionPolicy }
  const tracking = StateField.define<Tracking>({
    create: () => ({ policy: getPolicy() }),
    update: (old, tr) => {
      const policy = getPolicy();
      if (old.policy !== policy || !enabled(tr.startState)) return { policy };
      const record = tr.annotation(correctedWord);
      if (record) return { retry: record, policy };
      const run = decide(tr, old.run).run;
      let retry = old.retry;
      if (!policy.settings.respectRepeatedSpelling) retry = undefined;
      if (retry && tr.docChanged) {
        const event = tr.annotation(Transaction.userEvent) || '';
        if (!/^(input\.type|delete(?:\..*)?|undo|redo)$/.test(event) || tr.annotation(blockedInput)) {
          retry = undefined;
        } else {
          retry = { ...retry, from: tr.changes.mapPos(retry.from, -1),
            to: tr.changes.mapPos(retry.to, 1) };
          if (run && run.from !== retry.from) retry = undefined;
        }
      }
      if (retry && tr.selection &&
        (tr.newSelection.main.head < retry.from || tr.newSelection.main.head > retry.to + 1)) {
        retry = undefined;
      }
      return { run, retry, policy };
    },
  });
  return [blockContext, headerPolicy, eligibility, tracking, EditorState.transactionFilter.of(tr => {
    if (!enabled(tr.startState)) return tr;
    const previous = tr.startState.field(tracking);
    const policy = getPolicy();
    if (previous.policy !== policy) return tr;
    const candidate = decide(tr, previous.run).correction;
    if (!candidate) return tr;
    const original = tr.startState.doc.sliceString(candidate.from, candidate.to);
    if (policy.settings.respectRepeatedSpelling && previous.retry?.from === candidate.from &&
      previous.retry.original === original) return tr;
    const replacement = replacementFor(tr.startState, candidate.from, candidate.to, policy);
    if (!replacement || protectedAt(tr.startState, candidate.from, candidate.to)) return tr;
    return [tr, {
      sequential: true,
      changes: { from: candidate.from, to: candidate.to, insert: replacement },
      annotations: [ownCorrection.of(true), correctedWord.of({
        from: candidate.from, to: candidate.from + replacement.length, original,
      })],
    }];
  })];
}
