import "jest-canvas-mock";
import "../jestMockJsdom";
import { render } from "@testing-library/react";

import { TopCodeEditor, TopCodeEditorProps } from "./TopCodeEditor";

import { noop } from "../codemirror-editor/CodeMirror";

const renderComponent = (props: Partial<TopCodeEditorProps>) => {
  return render(
    // @ts-ignore
    <TopCodeEditor
      cell={{
        value: 10,
        expression: "10",
      }}
      activeRow={0}
      activeColumn={0}
      getAutocomplete={() => Promise.resolve({ result: [] })}
      value=""
      readOnly={false}
      onSubmit={noop}
      onTabSubmit={noop}
      isSelectingWhileEditing={false}
      onTopEditorClick={noop}
      onUpdate={noop}
      onUpdateCellValues={noop}
      onCellAttributeChange={noop}
      onEditingChange={noop}
      {...props}
    />
  );
};

test("TopCodeEditor should render value", () => {
  const { getByText } = renderComponent({ value: "foo" });

  expect(getByText("foo")).toBeInTheDocument();
});

test("TopCodeEditor should fire onTopEditorClick callback on click", () => {
  const handleTopEditorClick = jest.fn();
  const { getByText } = renderComponent({
    isSelectingWhileEditing: true,
    onTopEditorClick: handleTopEditorClick,
    value: "foo",
  });

  getByText("foo").click();
  expect(handleTopEditorClick).toHaveBeenCalledTimes(1);
});
