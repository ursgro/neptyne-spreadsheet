import { EditorView } from "@codemirror/view";
import { render } from "@testing-library/react";
import { CodeMirror } from "./CodeMirror";

test("CodeMirror should run onUpdate when content is changed", () => {
  let editor!: EditorView;
  const handleUpdate = jest.fn();
  const { queryByText } = render(
    <CodeMirror
      autofocus
      value="foo"
      editorViewFactory={(config) => {
        editor = new EditorView(config);
        return editor;
      }}
      onUpdate={(update) => {
        if (update.docChanged) {
          handleUpdate(update.state.doc.toString());
        }
      }}
    />
  );

  editor.domAtPos(1).node.nodeValue = "froo";
  // @ts-expect-error
  editor.observer.flush();

  expect(editor.state.doc.toString()).toBe("froo");
  expect(queryByText("foo")).not.toBeInTheDocument();
  expect(queryByText("froo")).toBeInTheDocument();
  expect(handleUpdate).toHaveBeenCalledWith("froo");
});
