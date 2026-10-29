import { Annotation, EditorState, Extension, StateEffect, StateField, Transaction } from '@codemirror/state';
import { CorrectionPolicy } from './settings';
import { DELIMITER, LETTER, MAX_CONTEXT, replacementFor, WORD_CHAR } from './correction';
import { blockContext } from './blocks';
import { headerPolicy } from './exclusions';
import { ViewPlugin } from '@codemirror/view';
import { CorrectionDiagnostics } from './diagnostics';

export const typedEnter = Annotation.define<boolean>();
export const blockedInput = Annotation.define<boolean>();
export const ownCorrection = Annotation.define<boolean>();
export const resetTracking = StateEffect.define<null>();
interface Retry extends Run { original: string }
const correctedWord = Annotation.define<Retry>();
interface Run { from: number; to: number; tail?: number }
interface Decision { run?: Run; correction?: { from: number; to: number; insert: string } }

function decide(tr: Transaction, run?: Run): Decision {
  if (!tr.docChanged) {
    // Widget/view updates may reassert the current selection. Only an actual
    // selection change relinquishes ownership of the word being typed.
    return { run: tr.selection && !tr.newSelection.eq(tr.startState.selection) ? undefined : run };
  }
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
  if (enter && !change.text.startsWith('\n')) return {};
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
    // The suffix may belong to an existing word. Only the newly typed span is
    // owned; a subsequently typed delimiter separates it from that suffix.
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
  protectedAt: (state: EditorState, from: number, to: number) => boolean | 'clear' | 'protected' | 'pending',
  getFilePath: (state: EditorState) => string | null = () => 'Note.md',
  diagnostics?: CorrectionDiagnostics): Extension {
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
    const path = getFilePath(state), policy = getPolicy();
    const allowed = file.path === path && file.policy === policy ? file.allowed
      : path !== null && !policy.excludesPath(path);
    return !policy.paused && allowed && !state.field(headerPolicy).disabled;
  };
  interface Tracking { run?: Run; retry?: Retry; policy: CorrectionPolicy }
  const tracking = StateField.define<Tracking>({
    create: () => ({ policy: getPolicy() }),
    update: (old, tr) => {
      const policy = getPolicy();
      if (!enabled(tr.startState) || tr.effects.some(effect => effect.is(resetTracking))) return { policy };
      const previous = old.policy === policy &&
        tr.startState.field(eligibility).path === getFilePath(tr.startState) ? old : { policy };
      const record = tr.annotation(correctedWord);
      if (record) return { retry: record, policy };
      const run = decide(tr, previous.run).run;
      let retry = previous.retry;
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
  interface Pending { from: number; to: number; original: string; replacement: string;
    policy: CorrectionPolicy; path: string | null; head: number; time: number }
  const defer = StateEffect.define<Pending | null>();
  const pending = StateField.define<Pending | null>({
    create: () => null,
    update(old, tr) {
      const effect = tr.effects.find(effect => effect.is(defer));
      if (effect) return effect.value;
      if (tr.docChanged || tr.selection && !tr.newSelection.eq(tr.startState.selection) || tr.effects.some(effect => effect.is(resetTracking)) ||
        old && (old.policy !== getPolicy() || old.path !== getFilePath(tr.startState) || Date.now() - old.time > 400)) {
        if (old) diagnostics?.emit(tr.docChanged ? 'pending-cancelled-edit' : 'pending-cancelled-context',
          tr.newDoc.length, old.from, old.to, tr.annotation(Transaction.userEvent));
        return null;
      }
      return old;
    },
  });
  const retryParsing = ViewPlugin.define(view => {
    let destroyed = false;
    return {
      destroy() { destroyed = true; },
      update() {
        const candidate = view.state.field(pending);
        if (!candidate || Date.now() - candidate.time > 400 || !enabled(view.state) ||
          protectedAt(view.state, candidate.from, candidate.to) === 'pending') return;
        // Parser progress may arrive without a document edit. Never dispatch
        // recursively from a view update or force parsing on the typing path.
        Promise.resolve().then(() => {
          if (destroyed || view.state.field(pending, false) !== candidate) return;
          const state = view.state;
          if (Date.now() - candidate.time > 400 || !enabled(state) ||
            candidate.policy !== getPolicy() || candidate.path !== getFilePath(state) ||
            state.selection.main.head !== candidate.head) return;
          const status = protectedAt(state, candidate.from, candidate.to);
          const clear = status === false || status === 'clear';
          diagnostics?.emit(clear ? 'applied-after-parse' : 'protected-after-parse', state.doc.length, candidate.from, candidate.to);
          view.dispatch({ effects: defer.of(null),
            changes: clear ? { from: candidate.from, to: candidate.to, insert: candidate.replacement } : undefined,
            annotations: clear ? [ownCorrection.of(true), Transaction.time.of(candidate.time),
              correctedWord.of({ from: candidate.from, to: candidate.from + candidate.replacement.length,
                original: candidate.original })] : undefined });
        });
      },
    };
  });
  return [blockContext, headerPolicy, eligibility, tracking, pending, retryParsing, EditorState.transactionFilter.of(tr => {
    if (!enabled(tr.startState) || tr.effects.some(effect => effect.is(resetTracking))) {
      if (tr.docChanged) diagnostics?.emit('disabled-or-reset', tr.newDoc.length, undefined, undefined, tr.annotation(Transaction.userEvent));
      return tr;
    }
    const previous = tr.startState.field(tracking);
    const policy = getPolicy();
    if (previous.policy !== policy) return tr;
    const candidate = decide(tr, previous.run).correction;
    const event = tr.annotation(Transaction.userEvent);
    const log = (reason: string) => diagnostics?.emit(reason, tr.newDoc.length, candidate?.from, candidate?.to, event);
    if (!candidate) { if (tr.docChanged) log('no-owned-word'); return tr; }
    const original = tr.startState.doc.sliceString(candidate.from, candidate.to);
    if (policy.settings.respectRepeatedSpelling && previous.retry?.from === candidate.from &&
      previous.retry.original === original) { log('deliberate-retry'); return tr; }
    const replacement = replacementFor(tr.startState, candidate.from, candidate.to, policy);
    if (!replacement) { log('unchanged-or-excluded'); return tr; }
    const protection = protectedAt(tr.startState, candidate.from, candidate.to);
    if (protection === 'pending') {
      log('syntax-pending');
      return [tr, { effects: defer.of({ ...candidate, original, replacement, policy,
        path: getFilePath(tr.startState), head: tr.newSelection.main.head,
        time: tr.annotation(Transaction.time) || Date.now() }) }];
    }
    if (protection === true || protection === 'protected') { log('protected'); return tr; }
    log('applied');
    return [tr, {
      sequential: true,
      changes: { from: candidate.from, to: candidate.to, insert: replacement },
      annotations: [ownCorrection.of(true), correctedWord.of({
        from: candidate.from, to: candidate.from + replacement.length, original,
      })],
    }];
  })];
}
