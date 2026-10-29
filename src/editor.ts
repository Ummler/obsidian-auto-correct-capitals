import { EditorState, Extension, Prec } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { blockedInput, correctionExtension, resetTracking, typedEnter } from './input';
import { CorrectionPolicy } from './settings';
import { protectionStatus } from './protection';
import { CorrectionDiagnostics } from './diagnostics';
import { editorInfoField } from 'obsidian';

export function editorExtension(getPolicy: () => CorrectionPolicy, diagnostics?: CorrectionDiagnostics): Extension {
  // Evidence belongs to a particular state, and is consumed by its next edit.
  // Do not expire at a microtask: DOMObserver may flush after beforeinput.
  const evidence = new WeakMap<EditorState, { enter?: boolean; blocked?: boolean }>();
  const remember = (view: EditorView, value: { enter?: boolean; blocked?: boolean }) => {
    const state = view.state;
    evidence.set(state, value);
  };
  return [
    // Observers run even when a higher-priority keymap consumes Enter.
    EditorView.domEventObservers({
      keydown(event, view) {
        if (event.key === 'Enter' && !event.isComposing) remember(view, { enter: true });
        else evidence.delete(view.state);
        return false;
      },
      keyup(event, view) {
        if (event.key === 'Enter') evidence.delete(view.state);
        return false;
      },
      beforeinput(event, view) {
        const input = event as InputEvent;
        if (input.isComposing || !['insertText', 'insertParagraph', 'insertLineBreak'].includes(input.inputType)) {
          remember(view, { blocked: true });
        } else if (input.inputType === 'insertText') evidence.delete(view.state);
        return false;
      },
      paste(_event, view) { remember(view, { blocked: true }); return false; },
      drop(_event, view) { remember(view, { blocked: true }); return false; },
      blur(_event, view) {
        evidence.delete(view.state);
        view.dispatch({ effects: resetTracking.of(null) });
        return false;
      },
      compositionstart(_event, view) {
        remember(view, { blocked: true });
        view.dispatch({ effects: resetTracking.of(null) });
        return false;
      },
    }),
    // Filters run in reverse order; lowest precedence adds evidence first.
    Prec.lowest(EditorState.transactionFilter.of(tr => {
      const intent = evidence.get(tr.startState);
      if (!intent) return tr;
      if (tr.docChanged) evidence.delete(tr.startState);
      return [tr, { annotations: [typedEnter.of(!!intent.enter), blockedInput.of(!!intent.blocked)] }];
    })),
    correctionExtension(getPolicy, protectionStatus,
      state => state.field(editorInfoField, false)?.file?.path || null, diagnostics),
  ];
}
