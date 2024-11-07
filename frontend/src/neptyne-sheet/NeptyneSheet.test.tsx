import "jest-canvas-mock";
import "../jestMockJsdom";
import "../jestMockCanvas";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createGrid,
  dependsOnColors,
  parseCellId,
  ParsedSheetCell,
} from "../SheetUtils";
import { GRID_HEIGHT, GRID_WIDTH } from "./NeptyneSheet";
import { ProfiledComponent, withProfiler } from "../test-profiler";
import { NeptyneCell, NeptyneCellProps } from "./NeptyneCell";
import { MockedNeptyneSheet } from "./mocks";
import { CellHeader, CellHeaderProps } from "./CellHeader";
import { Dimension } from "../NeptyneProtocol";
import { hexToRgb } from "@mui/material";

jest.mock("./DataEditorRenderer.tsx");

const getCell = (container: ParentNode, name: string) => {
  const { x: col, y: row } = parseCellId(name) as ParsedSheetCell;
  return container.querySelector(
    //`tbody > :nth-child(${row + 1}) > :nth-child(${col + 2})`
    `[data-testid="cell-${row}-${col}"]`
  ) as Element;
};

const getColumnHeader = (container: ParentNode, name: string) => {
  const { x: col } = parseCellId(name) as ParsedSheetCell;
  return container.querySelector(`thead > tr > :nth-child(${col + 2})`) as Element;
};

test.skip("Sheet should detect that value has been pasted", async () => {
  const handleUpdateCellValues = jest.fn();
  const grid = createGrid(GRID_WIDTH, GRID_HEIGHT);
  grid[0][0] = {
    value: "1",
    expression: "=1",
  };

  grid[1][0] = {
    value: "1",
    expression: "=A1",
  };

  const { container } = render(
    <MockedNeptyneSheet onUpdateCellValues={handleUpdateCellValues} grid={grid} />
  );
  const cellFrom = getCell(container, "A1");
  const cellTo = getCell(container, "A2");
  await act(async () => {
    fireEvent.contextMenu(cellFrom);
    // wait for context menu animation
    await new Promise((r) => setTimeout(r, 500));
    const copyOption = screen.getByText("Copy");
    userEvent.click(copyOption);
    fireEvent.contextMenu(cellTo);
    // wait for context menu animation
    await new Promise((r) => setTimeout(r, 500));
    const pasteOption = screen.getByText("Paste");
    userEvent.click(pasteOption);
  });
  expect(handleUpdateCellValues).toHaveBeenCalledWith(
    expect.any(Array),
    true,
    null,
    expect.any(String)
  );
});

test.skip("cell with long string should not stretch", async () => {
  const handleUpdateCellValues = jest.fn();
  const grid = createGrid(GRID_WIDTH, GRID_HEIGHT);

  const value = "long".repeat(40);

  grid[0][0] = {
    value,
    expression: value,
  };

  const { container } = render(
    <MockedNeptyneSheet onUpdateCellValues={handleUpdateCellValues} grid={grid} />
  );

  const cellHeader = getColumnHeader(container, "A1");
  expect(cellHeader).toHaveStyle("width: 100px;");
  expect(cellHeader).toHaveStyle("minWidth: 100px;");
});

test("should gracefully reset cell content on ESC when content is deleted", () => {
  const handleUpdateCellValues = jest.fn();
  const grid = createGrid(GRID_WIDTH, GRID_HEIGHT);
  grid[0][0] = {
    value: "2",
    expression: "=1+1",
  };

  const { container } = render(
    <MockedNeptyneSheet onUpdateCellValues={handleUpdateCellValues} grid={grid} />
  );

  const cellA1 = getCell(container, "A1");
  userEvent.dblClick(cellA1);
  userEvent.keyboard("{backspace}{backspace}{esc}");
  // cell value should not be updated
  expect(handleUpdateCellValues).toHaveBeenCalledTimes(0);
});

test("should show autofill drag control if cell is focused", () => {
  const { container, rerender } = render(<MockedNeptyneSheet />);

  // A1 is selected by default
  const cellA1 = getCell(container, "A1");
  expect(cellA1.querySelector("#autofill-drag-control")).toBeInTheDocument();

  // A2 does not have autofill drag control
  const cellA2 = getCell(container, "A2");
  expect(cellA2.querySelector("#autofill-drag-control")).not.toBeInTheDocument();

  // move selection to the D4
  rerender(
    <MockedNeptyneSheet
      sheetSelection={{ start: { row: 3, col: 3 }, end: { row: 3, col: 3 } }}
    />
  );

  const cellD4 = getCell(container, "D4");
  expect(cellD4.querySelector("#autofill-drag-control")).toBeInTheDocument();
});

test.skip("should not show autofill drag control if cell is in edit mode", () => {
  const { container } = render(<MockedNeptyneSheet />);

  // A1 is selected by default
  const cellA1 = getCell(container, "A1");
  expect(cellA1.querySelector("#autofill-drag-control")).toBeInTheDocument();

  userEvent.dblClick(cellA1);
  expect(cellA1.querySelector("#autofill-drag-control")).not.toBeInTheDocument();
});

test.skip("should preserve currently edited value when grid is updated", () => {
  const grid = createGrid(GRID_WIDTH, GRID_HEIGHT);

  const { container, rerender } = render(<MockedNeptyneSheet grid={grid} />);

  const cellA1 = getCell(container, "A1");

  act(() => {
    userEvent.click(cellA1);
    userEvent.dblClick(cellA1);
    userEvent.type(cellA1, "foobar");
  });

  const nextGrid = [...grid];
  nextGrid[0][0] = {
    value: "hello",
    expression: "hello",
  };
  rerender(<MockedNeptyneSheet grid={nextGrid} />);

  const cellA1Editor = getCell(container, "A1").getElementsByClassName(
    "data-editor"
  )[0];

  expect(cellA1Editor).not.toHaveAttribute("value", "hello");
});

test("grid renders footer content", async () => {
  const { container } = render(
    <MockedNeptyneSheet footerContent={<div>footer content</div>} />
  );

  expect(container).toHaveTextContent("footer content");
});

jest.mock("./NeptyneCell", () => ({
  NeptyneCell: jest
    .requireActual("../test-profiler")
    .withProfiler(jest.requireActual("./NeptyneCell").NeptyneCell),
}));

jest.mock("./CellHeader", () => ({
  CellHeader: jest
    .requireActual("../test-profiler")
    .withProfiler(
      jest.requireActual("./CellHeader").CellHeader,
      "CellHeader",
      "dimension",
      "memo"
    ),
}));

describe("NeptyneSheet performance test", () => {
  function clearCounters() {
    for (const Component of [NeptyneCell, CellHeader] as ProfiledComponent<unknown>[])
      Component.clearCounters();
  }

  beforeEach(() => {
    clearCounters();
  });

  const ProfiledSheet = withProfiler(MockedNeptyneSheet);

  const initialCellRendersCount = 275;
  test("initial render", () => {
    render(<ProfiledSheet />);
    expect((NeptyneCell as ProfiledComponent<NeptyneCellProps>).__numRenders).toBe(
      initialCellRendersCount
    );
    expect((CellHeader as ProfiledComponent<CellHeaderProps>).__numRenders).toBe(36);
  });

  test("selection change", async () => {
    const { rerender } = render(<MockedNeptyneSheet />);
    clearCounters();
    rerender(
      <MockedNeptyneSheet
        sheetSelection={{ start: { row: 1, col: 0 }, end: { row: 1, col: 0 } }}
      />
    );
    expect((NeptyneCell as ProfiledComponent<NeptyneCellProps>).__numRenders).toBe(2);
    expect(
      (CellHeader as ProfiledComponent<CellHeaderProps>).__rendersByPropValue.get(
        Dimension.Col
      )
    ).toBe(0);
    expect(
      (CellHeader as ProfiledComponent<CellHeaderProps>).__rendersByPropValue.get(
        Dimension.Row
      )
    ).toBe(0);
  });

  test("value in top editor changes", () => {
    const { getByTestId } = render(<ProfiledSheet />);
    clearCounters();
    const topEditor = getByTestId("top-data-editor");
    act(() => {
      userEvent.click(topEditor);
      userEvent.keyboard("=");
    });
    expect((NeptyneCell as ProfiledComponent<NeptyneCellProps>).__numRenders).toBe(0);
    expect(
      (CellHeader as ProfiledComponent<CellHeaderProps>).__rendersByPropValue.get(
        Dimension.Col
      )
    ).toBe(0);
    expect(
      (CellHeader as ProfiledComponent<CellHeaderProps>).__rendersByPropValue.get(
        Dimension.Row
      )
    ).toBe(0);
  });

  test("value in cell editor changes", () => {
    const { container } = render(<ProfiledSheet />);
    clearCounters();
    const cellA1 = getCell(container, "A1");
    act(() => {
      userEvent.dblClick(cellA1);
      userEvent.keyboard("=");
      userEvent.keyboard("1");
    });
    expect(
      (CellHeader as ProfiledComponent<CellHeaderProps>).__rendersByPropValue.get(
        Dimension.Col
      )
    ).toBe(0);
    expect(
      (CellHeader as ProfiledComponent<CellHeaderProps>).__rendersByPropValue.get(
        Dimension.Row
      )
    ).toBe(0);
  });

  test("active col changes", () => {
    const { rerender } = render(<ProfiledSheet />);
    clearCounters();
    rerender(<ProfiledSheet activeColumn={1} />);
    expect((NeptyneCell as ProfiledComponent<NeptyneCellProps>).__numRenders).toBe(2);
    expect(
      (CellHeader as ProfiledComponent<CellHeaderProps>).__rendersByPropValue.get(
        Dimension.Col
      )
    ).toBe(2);
    expect(
      (CellHeader as ProfiledComponent<CellHeaderProps>).__rendersByPropValue.get(
        Dimension.Row
      )
    ).toBe(0);
  });

  test("active row changes", () => {
    const { rerender } = render(<ProfiledSheet />);
    clearCounters();
    rerender(<ProfiledSheet activeRow={1} />);
    expect((NeptyneCell as ProfiledComponent<NeptyneCellProps>).__numRenders).toBe(2);
    expect(
      (CellHeader as ProfiledComponent<CellHeaderProps>).__rendersByPropValue.get(
        Dimension.Col
      )
    ).toBe(0);
    expect(
      (CellHeader as ProfiledComponent<CellHeaderProps>).__rendersByPropValue.get(
        Dimension.Row
      )
    ).toBe(2);
  });

  test("NeptyneSheetRenderer stable props", () => {
    const { rerender } = render(<ProfiledSheet />);
    clearCounters();
    rerender(<ProfiledSheet activeRow={0} />);
    expect((CellHeader as ProfiledComponent<CellHeaderProps>).__numRenders).toBe(0);
  });
});

test.skip("sheet search", () => {
  const { rerender, queryByTestId } = render(<MockedNeptyneSheet />);
  expect(queryByTestId("sheet-search-input")).not.toBeInTheDocument();
  rerender(<MockedNeptyneSheet isSearchPanelOpen />);
  expect(queryByTestId("sheet-search-input")).toBeInTheDocument();
});

test.each<[string, string, string[]]>([
  ["formula with ranges", "=SUM(A3:A5, B1, C2:C5)", ["A5", "B1", "C2"]],
  ["addresses with $", "=MIN($A$3:$A$5, $B$1, $C$2:$C$5)", ["A5", "B1", "C2"]],
  ["addresses with !", "=MAX(Sheet0!A3:A5, Sheet2!B1, C2:C5)", ["A5", "C2"]],
  ["infinite ranges", "=SUM(A:B,3:4)", ["B9", "I4"]],
])("Highlight dependent cells (%s). Formula: %s. Cells: %s", (name, formula, cells) => {
  const grid = createGrid(GRID_WIDTH, GRID_HEIGHT);
  // Use G1 cell for the formula
  grid[0][6] = {
    value: "0",
    expression: formula,
  };
  const { container } = render(<MockedNeptyneSheet grid={grid} />);
  const formula_cell = getCell(container, "G1");
  fireEvent.dblClick(formula_cell);

  for (let i = 0; i < cells.length; i++) {
    const cell = getCell(container, cells[i]);
    expect(cell).toHaveStyle({
      outline: "1px dashed",
      "outline-color": `${hexToRgb(dependsOnColors[i].border)}`,
      "background-color": `${hexToRgb(dependsOnColors[i].bg)}`,
    });
  }
});
