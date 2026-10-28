// The merge model lives in the result editor's EditorState (MergeModelBase): tracked line ranges are mapped through
// every document change, merge commands replace them with an effect, and every transaction registers the previous
// model as an inverted effect so CodeMirror's undo/redo restores ranges + resolved flags together with the text
// (MergeModelBase.UndoableAction).
import { StateEffect, StateField, type Extension } from '@codemirror/state';
import { invertedEffects } from '@codemirror/commands';
import { mapStates, type ChangeState, type MergeChange } from './model';

export interface MergeStateValue {
  changes: readonly MergeChange[];
  states: ChangeState[];
}

export const setMergeState = StateEffect.define<MergeStateValue>();

export const mergeStateField = StateField.define<MergeStateValue>({
  create: () => ({ changes: [], states: [] }),
  update(value, tr) {
    let next = value;
    if (tr.docChanged && value.states.length) {
      next = { changes: value.changes, states: mapStates(value.states, value.changes, tr.startState.doc, tr.changes) };
    }
    // the last effect wins: grouped undo events list the oldest restore last
    for (const e of tr.effects) if (e.is(setMergeState)) next = e.value;
    return next;
  },
});

const mergeStateHistory = invertedEffects.of((tr) => {
  const before = tr.startState.field(mergeStateField, false);
  const after = tr.state.field(mergeStateField, false);
  if (!before || before === after) return [];
  return [setMergeState.of(before)];
});

export function mergeState(): Extension {
  return [mergeStateField, mergeStateHistory];
}
