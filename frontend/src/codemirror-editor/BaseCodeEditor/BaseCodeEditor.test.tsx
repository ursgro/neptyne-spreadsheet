import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BaseCodeEditor } from "./BaseCodeEditor";
import { getCodemirrorContainerFromElement, type } from "../test-helpers";
import { act } from "react-dom/test-utils";
import { EditorView } from "@codemirror/view";

test("BaseCodeEditor should render value", () => {
  const { getByText } = render(<BaseCodeEditor value="foo" />);

  expect(getByText("foo")).toBeInTheDocument();
});

test("BaseCodeEditor should re-render value", () => {
  const { getByText, queryByText, rerender } = render(<BaseCodeEditor value="foo" />);

  rerender(<BaseCodeEditor value="bar" />);

  expect(queryByText("foo")).not.toBeInTheDocument();
  expect(getByText("bar")).toBeInTheDocument();
});

test("BaseCodeEditor should have focus if stated in props", () => {
  const { container } = render(<BaseCodeEditor autofocus value="foo" />);

  const editor = getCodemirrorContainerFromElement(container);

  expect(editor).toHaveFocus();
});

test("BaseCodeEditor should have focus if props changed", () => {
  const { container, rerender } = render(<BaseCodeEditor value="foo" />);

  const editor = getCodemirrorContainerFromElement(container);

  expect(editor).not.toHaveFocus();

  rerender(<BaseCodeEditor value="foo" autofocus />);

  const focusedEditor = getCodemirrorContainerFromElement(container);

  expect(focusedEditor).toHaveFocus();
});

test("BaseCodeEditor should emit blur event", async () => {
  const handleBlur = jest.fn();
  const { getByText, getByTestId } = render(
    <>
      <div data-testid="outside">some outside div</div>
      <BaseCodeEditor autofocus value="foo" onBlur={handleBlur} />
    </>
  );

  await act(async () => {
    await userEvent.click(getByText("foo"));
    await userEvent.click(getByTestId("outside"));
  });
  expect(handleBlur).toHaveBeenCalled();
});

test("BaseCodeEditor should allow editing when readOnly = false", async () => {
  let editor!: EditorView;
  const handleUpdate = jest.fn();
  const { container } = render(
    <BaseCodeEditor
      value="neptyne"
      editorViewFactory={(config) => {
        editor = new EditorView(config);
        return editor;
      }}
      onUpdate={(update) =>
        handleUpdate(update.docChanged, update.state.doc.toString())
      }
    />
  );

  await act(async () => {
    type(editor, ", wow!");
  });

  expect(handleUpdate).toHaveBeenCalledWith(true, "neptyne, wow!");

  expect(container).toHaveTextContent("neptyne, wow!");
});
