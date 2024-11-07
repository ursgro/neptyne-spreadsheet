import "jest-canvas-mock";
import "../jestMockJsdom";
import { render } from "@testing-library/react";
import { noop } from "../codemirror-editor/CodeMirror";

import {
  CellAttribute,
  LineWrap,
  NumberFormat,
  TextAlign,
  TextStyle,
} from "../NeptyneProtocol";
import { getColorCellStyles, NeptyneCell } from "./NeptyneCell";
import { attributesToCssClass, CellAttributes, GridElement } from "../SheetUtils";
import { getAttributesWithUpdatedNumberFormat } from "./sheet-hooks";

test("color and background color should be applied to cell if it is not edited", () => {
  expect(
    getColorCellStyles(false, false, false, {
      [CellAttribute.Color]: "red",
      [CellAttribute.BgColor]: "blue",
    })
  ).toMatchObject({
    color: "red",
    backgroundColor: "blue",
  });
});

test("color and background color should not applied to cell if it is edited", () => {
  expect(
    getColorCellStyles(true, false, false, {
      [CellAttribute.Color]: "red",
      [CellAttribute.BgColor]: "blue",
    })
  ).toMatchObject({});
});

test("background color should not be blended if only one cell is selected", () => {
  // @ts-ignore
  expect(getColorCellStyles(false, true, true, {})["::before"]).toBeUndefined();
});

test.each<[LineWrap | undefined, string]>([
  [LineWrap.Wrap, "cell-autosize-mode"],
  [LineWrap.Overflow, "cell-overflow-mode"],
  [LineWrap.Truncate, "cell-truncate-mode"],
  [undefined, "cell-truncate-mode"],
])("%s cell mode should have following classes: %s", (lineWrap, className) => {
  const cell: GridElement = {
    value: "123",
    expression: "=123",
    attributes: {
      [CellAttribute.Color]: "red",
      [CellAttribute.Class]: "cell-edit-date",
    },
  };
  if (lineWrap && cell.attributes) {
    cell.attributes[CellAttribute.LineWrap] = lineWrap;
  }
  expect(attributesToCssClass(cell, true, "cell", true, true, false)).toBe(
    `cell first-selected-cell ${className}`
  );
});

describe("matching text align styles for cells", () => {
  const grid: GridElement[][] = [
    [
      {
        value: 10,
        expression: "10",
      },
      {
        value: "test",
        expression: "test",
      },
    ],
    [
      {
        value: 20,
        expression: "20",
      },
      {
        value: "other",
        expression: "other",
      },
    ],
  ];

  const renderCell = (row: number, col: number, cell: GridElement) => {
    return render(
      /*@ts-ignore*/
      <NeptyneCell
        row={row}
        col={col}
        cell={cell}
        editing={false}
        readOnly={false}
        isEditMode={false}
        className={"test-class"}
        isTheOnlyCellSelected={false}
        inSelection={false}
        isCodeCell={false}
        isCurrentCell={false}
        isFrozenColBound={false}
        isFrozenRowBound={false}
        showAutofillDragControl={false}
        areGridlinesHidden={false}
        onAutofillDragStart={noop}
        onAutofillDragStop={noop}
        onAutofillDragCellMove={noop}
        onWidgetChange={noop}
        onMouseDown={noop}
        onMouseOver={noop}
        onDoubleClick={noop}
        onContextMenu={noop}
        callServerMethod={() => Promise.resolve({ result: [] })}
        children={null}
      />
    );
  };

  test("cell with number value must have additional style textAlign=right", () => {
    const { container } = renderCell(0, 0, grid[0][0]);
    const element = container.getElementsByClassName(
      "test-class"
    ) as HTMLCollectionOf<HTMLElement>;
    expect(element[0].classList.contains("cell-format-text-align-right")).toBe(true);
  });

  test("cell with text value must be left-aligned", () => {
    const { container } = renderCell(0, 1, grid[0][1]);
    const element = container.getElementsByClassName(
      "test-class"
    ) as HTMLCollectionOf<HTMLElement>;
    expect(element[0].style.textAlign).toBe("");
  });
});

test.each<[string, CellAttributes, CellAttributes]>([
  [
    "test",
    {
      [CellAttribute.NumberFormat]: NumberFormat.Money,
      [CellAttribute.TextAlign]: TextAlign.Right,
    },
    {
      [CellAttribute.NumberFormat]: NumberFormat.Money,
      [CellAttribute.TextAlign]: TextAlign.Right,
    },
  ],
  [
    "10",
    {
      [CellAttribute.NumberFormat]: NumberFormat.Percentage,
      [CellAttribute.TextStyle]: TextStyle.Bold,
    },
    {
      [CellAttribute.TextStyle]: TextStyle.Bold,
    },
  ],
  [
    "10/10/1900",
    {
      [CellAttribute.NumberFormat]: NumberFormat.Float,
      [CellAttribute.TextAlign]: TextAlign.Left,
      [CellAttribute.TextStyle]: TextStyle.Underline,
    },
    {
      [CellAttribute.NumberFormat]: `${NumberFormat.Date}-MM/dd/yyyy`,
      [CellAttribute.TextAlign]: TextAlign.Left,
      [CellAttribute.TextStyle]: TextStyle.Underline,
    },
  ],
  ["10", {}, {}],
  ["10", { [CellAttribute.NumberFormat]: NumberFormat.Percentage }, {}],
  [
    "10 %",
    {},
    {
      [CellAttribute.NumberFormat]: NumberFormat.Percentage,
    },
  ],
])(
  "Given %s and %p getAttributesWithUpdatedNumberFormat should %p",
  (value, currentCelAttibutes, resultAttributes) => {
    const newAttributes = getAttributesWithUpdatedNumberFormat(
      value,
      currentCelAttibutes
    );
    expect(newAttributes).toEqual(resultAttributes);
  }
);
