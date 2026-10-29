import { EditorState, Extension, Prec } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { blockedInput, correctionExtension, resetTracking, typedEnter } from './input';
import { CorrectionPolicy } from './settings';
import { isProtected } from './protection';
import { editorInfoField } from 'obsidian';

export function editorExtension(getPolicy: () => CorrectionPolicy): Extension {
  // Evidence belongs to a particular editor state and expires in this turn.
  const evidence = new WeakMap<EditorState, { enter?: boolean; blocked?: boolean }>();
  const remember = (view: EditorView, value: { enter?: boolean; blocked?: boolean }) => {
    const state = view.state;
    evidence.set(state, value);
    Promise.resolve().then(() => evidence.delete(state));
  };
  return [
    EditorView.domEventHandlers({
      keydown(event, view) {
        if (event.key === 'Enter' && !event.isComposing) remember(view, { enter: true });
        return false;
      },
      beforeinput(event, view) {
        const input = event as InputEvent;
        if (input.isComposing || !['insertText', 'insertParagraph', 'insertLineBreak'].includes(input.inputType)) {
          remember(view, { blocked: true });
        }
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
      return [tr, { annotations: [typedEnter.of(!!intent.enter), blockedInput.of(!!intent.blocked)] }];
    })),
    correctionExtension(getPolicy, isProtected,
      state => state.field(editorInfoField, false)?.file?.path || null),
  ];
}
