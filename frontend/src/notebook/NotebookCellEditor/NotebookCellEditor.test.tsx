import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { getCodemirrorContainerFromElement } from "../../codemirror-editor/test-helpers";
import { NotebookCellEditor } from "./NotebookCellEditor";
import { EditorType } from "../../neptyne-sheet/SheetCodeEditor/sheetCodeEditorUtils";
import { act } from "react-dom/test-utils";

test("NotebookCellEditor should render value", () => {
  const { getByText } = render(
    <NotebookCellEditor editorType={EditorType.codepane} value="foo" />
  );

  expect(getByText("foo")).toBeInTheDocument();
});

test("NotebookCellEditor should indent on Tab", async () => {
  const handleChanges = jest.fn();
  const { container } = render(
    <NotebookCellEditor editorType={EditorType.codepane} onChanges={handleChanges} />
  );

  const editor = getCodemirrorContainerFromElement(container);
  await act(async () => {
    await userEvent.click(editor);
    await userEvent.keyboard("{Tab}");
  });

  expect(handleChanges).toHaveBeenCalledWith("    ", true);
});
