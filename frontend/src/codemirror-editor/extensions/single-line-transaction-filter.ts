import { EditorState } from "@codemirror/state";

export const SINGLE_LINE_TRANSACTION_FILTER = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || tr.newDoc.lines === 1) {
    return tr;
  }
  const removeNewlineTransaction = tr.startState.update({
    changes: {
      from: 0,
      to: tr.startState.doc.length,
      insert: tr.state.doc.toString().replaceAll(/\n/g, ""),
    },
    selection: tr.startState.selection,
  });

  return removeNewlineTransaction;
});
