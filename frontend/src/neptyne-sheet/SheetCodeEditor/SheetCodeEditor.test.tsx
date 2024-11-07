import { render, act } from "@testing-library/react";

import {
  getCodemirrorScrollerFromElement,
  type,
} from "../../codemirror-editor/test-helpers";
import SheetCodeEditor, { SheetCodeEditorProps } from "./sheetCodeEditor";
import { noop } from "../../codemirror-editor/CodeMirror";
import { EditorView } from "@codemirror/view";
import {
  AutocompleteRequest,
  AutocompleteResponse,
  AutocompleteType,
} from "../../notebook/NotebookCellEditor/types";

const renderComponent = (props: Partial<SheetCodeEditorProps>) => {
  return render(
    <SheetCodeEditor
      autofocus
      value=""
      onBlur={noop}
      activeRow={1}
      activeColumn={1}
      {...props}
    />
  );
};

test("SheetCodeEditor should render value", () => {
  const { getByText } = renderComponent({ value: "foo" });

  expect(getByText("foo")).toBeInTheDocument();
});

// TODO: write test on dynamic style change when values change.
test("SheetCodeEditor should have number highlight when formula is recognized", () => {
  const { container } = renderComponent({ value: "=1" });

  const span = container
    .getElementsByClassName("cm-line")[0]
    .getElementsByTagName("span")[0];
  expect(span.className).toContain("ͼ");
});

// TODO: write test on dynamic style change when values change.
test("SheetCodeEditor should have custom font when no formula is recognized", () => {
  const { container } = renderComponent({ value: "1" });

  const editor = getCodemirrorScrollerFromElement(container);
  expect(editor).toHaveStyle({ "font-family": "sans-serif" });
});

test("SheetCodeEditor should run autocomplete for if value is updated", async () => {
  let editor!: EditorView;
  const handleAutocomplete = jest.fn(
    (
      request: AutocompleteRequest,
      type: AutocompleteType
    ): Promise<AutocompleteResponse> => {
      if (request.expression === "SU" && type === "globalObject") {
        return Promise.resolve({ result: [{ label: "SUM", type: "function" }] });
      }
      if (request.expression === "SUMLIB." && type === "property") {
        return Promise.resolve({ result: [{ label: "foo", type: "function" }] });
      }
      return Promise.resolve({ result: [] });
    }
  );
  renderComponent({
    autofocus: true,
    value: "=",
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

  expect(handleAutocomplete).toHaveBeenCalledWith(
    { expression: "SU", cursorPosition: 2, kwargs: { skip_formulas: false } },
    "globalObject"
  );
  expect(
    document.getElementsByClassName("cm-tooltip-autocomplete")[0]
  ).toBeInTheDocument();

  // properties
  await act(async () => {
    type(editor, "M");
    type(editor, "L");
    type(editor, "I");
    type(editor, "B");
    type(editor, ".");
    await new Promise((r) => setTimeout(r, 100));
  });

  expect(handleAutocomplete).toHaveBeenCalledWith(
    { expression: "SUMLIB.", cursorPosition: 7 },
    "property"
  );
  expect(
    document.getElementsByClassName("cm-tooltip-autocomplete")[0]
  ).toBeInTheDocument();
});

test("SheetCodeEditor should not run autocomplete if value is not a formula", async () => {
  let editor!: EditorView;
  const handleAutocomplete = jest.fn();
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

  expect(handleAutocomplete).not.toHaveBeenCalled();
});
