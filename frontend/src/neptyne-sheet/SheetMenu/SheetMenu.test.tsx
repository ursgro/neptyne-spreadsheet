import { screen } from "@testing-library/dom";
import { fireEvent, render, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { noop } from "../../codemirror-editor/CodeMirror";
import { SheetsMenu, SheetsMenuProps } from "./SheetMenu";
import { SheetNameEditorProps, SheetNameEditor } from "./SheetNameEditor";

const MockedSheetsMenu = (props: Partial<SheetsMenuProps>) => (
  <SheetsMenu
    sheets={[]}
    sheetsOrder={[]}
    onSheetsReorder={noop}
    onAddSheet={noop}
    onDeleteSheet={noop}
    onRenameSheet={noop}
    onSheetClick={noop}
    {...props}
  />
);

test("SheetMenu displays all provided sheet names", async () => {
  const sheets = [
    { name: "foo", id: 1 },
    { name: "bar", id: 2 },
  ];
  const { container } = render(<MockedSheetsMenu sheets={sheets} />);

  expect(container).toHaveTextContent("foo");
  expect(container).toHaveTextContent("bar");
});

test("SheetMenu allows adding new sheets", async () => {
  const handleAddSheet = jest.fn();
  render(<MockedSheetsMenu onAddSheet={handleAddSheet} />);

  screen.getByLabelText("add sheet").click();
  expect(handleAddSheet).toHaveBeenCalledTimes(1);
});

test("SheetMenu allows navigating to existing sheet", async () => {
  const handleSheetClick = jest.fn();
  render(
    <MockedSheetsMenu
      sheets={[{ name: "foo", id: 22 }]}
      onSheetClick={handleSheetClick}
    />
  );

  screen.getByText("foo").click();

  expect(handleSheetClick).toHaveBeenCalledWith(22);
});

test.skip("SheetMenu allows opening context menu", async () => {
  render(<MockedSheetsMenu sheets={[{ name: "foo", id: 1 }]} />);

  fireEvent.mouseOver(screen.getByText("foo"));

  await waitFor(() => {
    screen.getByLabelText("menu item dropdown").click();
    expect(screen.getByText("Rename")).toBeInTheDocument();
  });
});

test.skip("SheetMenu toggles editing", async () => {
  render(<MockedSheetsMenu sheets={[{ name: "foo", id: 1 }]} />);

  fireEvent.mouseOver(screen.getByText("foo"));

  await waitFor(() => {
    screen.getByText("Rename").click();
    expect(screen.getByLabelText("sheet name input")).toBeInTheDocument();
  });
});

const MockedSheetNameEditor = (props: Partial<SheetNameEditorProps>) => (
  <SheetNameEditor
    value="foo"
    onRevert={noop}
    onSubmit={noop}
    hasErrors={() => undefined}
    {...props}
  />
);

test("SheetNameEditor renders value", () => {
  render(<MockedSheetNameEditor value="foo" />);
  expect(screen.getByDisplayValue("foo")).toBeInTheDocument();
});

test("SheetNameEditor input changes value", async () => {
  const handleSubmit = jest.fn();
  render(<MockedSheetNameEditor value="foo" onSubmit={handleSubmit} />);

  await act(async () => {
    const input = screen.getByDisplayValue("foo");
    await userEvent.clear(input);
    await userEvent.keyboard("Neptyne rocks!");
  });
  expect(screen.getByDisplayValue("Neptyne rocks!")).toBeInTheDocument();
});

test("SheetNameEditor handles submit on enter", async () => {
  const handleSubmit = jest.fn();
  const { getByDisplayValue } = render(
    <MockedSheetNameEditor value="foo" onSubmit={handleSubmit} />
  );

  await act(async () => {
    const input = getByDisplayValue("foo");
    await userEvent.clear(input);
    await userEvent.keyboard("Neptyne rocks!{Enter}", {});
  });

  expect(handleSubmit).toHaveBeenCalledWith("Neptyne rocks!");
});

test.skip("SheetNameEditor handles submit on blur", async () => {
  const handleSubmit = jest.fn();
  render(
    <>
      <div aria-label="something else"></div>
      <MockedSheetNameEditor value="foo" onSubmit={handleSubmit} />
    </>
  );

  const input = screen.getByDisplayValue("foo");

  await act(async () => {
    await userEvent.clear(input);
    await userEvent.keyboard("Neptyne rocks!");
    await userEvent.click(screen.getByLabelText("something else"));
  });

  expect(handleSubmit).toHaveBeenCalledWith("Neptyne rocks!");
});

test.skip("SheetNameEditor handles revert on ESC", async () => {
  const handleRevert = jest.fn();
  const { getByDisplayValue } = render(
    <MockedSheetNameEditor value="foo" onRevert={handleRevert} />
  );

  await act(async () => {
    const input = getByDisplayValue("foo");
    await userEvent.clear(input);
    await userEvent.keyboard("Neptyne rocks!{escape}");
  });
  expect(handleRevert).toHaveBeenCalled();
});

test("SheetNameEditor handles revert on blur if value did not change", async () => {
  const handleRevert = jest.fn();
  const { getByDisplayValue, getByLabelText } = render(
    <>
      <div aria-label="something else"></div>
      <MockedSheetNameEditor value="foo" onRevert={handleRevert} />
    </>
  );

  await act(async () => {
    const input = getByDisplayValue("foo");

    await userEvent.click(input);

    await userEvent.click(getByLabelText("something else"));
  });

  expect(handleRevert).toHaveBeenCalled();
});
