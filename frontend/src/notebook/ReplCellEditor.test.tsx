import { render, act } from "@testing-library/react";

import { EditorView } from "@codemirror/view";
import { ReplCellEditor, ReplEditorProps } from "./ReplCellEditor";
import { type } from "../codemirror-editor/test-helpers";
import {
  CellIdPickingContext,
  CellIdPickingStore,
} from "../cell-id-picking/cell-id-picking.store";

const noop = () => {};

const renderComponent = (props: Partial<ReplEditorProps>) => {
  return render(
    <CellIdPickingContext.Provider value={new CellIdPickingStore()}>
      <ReplCellEditor
        autofocus
        value=""
        showPlaceholder={false}
        onBlur={noop}
        promptMode={"python"}
        togglePromptMode={noop}
        {...props}
      />
    </CellIdPickingContext.Provider>
  );
};

test("ReplCellEditor should call for autocomplete", async () => {
  let editor!: EditorView;
  const handleAutocomplete = jest.fn(() => Promise.resolve({ result: [] }));
  renderComponent({
    autofocus: true,
    value: "",
    editorViewFactory: (config) => {
      editor = new EditorView(config);
      return editor;
    },
    getAutocomplete: handleAutocomplete,
  });

  // global functions
  await act(async () => {
    type(editor, "S");
    type(editor, "U");
    await new Promise((r) => setTimeout(r, 100));
  });

  expect(handleAutocomplete).toHaveBeenCalled();
});
