import _ from "lodash";
import { EditorSelection } from "@codemirror/state";
import {
  CellAttribute,
  Dimension,
  NumberFormat,
  SheetUnawareCellId,
} from "./NeptyneProtocol";
import { SheetSelection, SheetLocation, changeNumberOfDecimals } from "./SheetUtils";
import {
  a1ColToIx,
  canChangeCellAttributes,
  createGrid,
  formatNumber,
  getDimensionNames,
  getRangeOfSelectedDimensions,
  getSelectionClearChanges,
  getUpdatedTextStyle,
  GridElement,
  hasSelectionProtectedCells,
  isPercentageValue,
  isCurrencyValue,
  numberWithDecimals,
  parseCellId,
  resizeGrid,
  skipContiguousCells,
  toA1,
  isValidPythonName,
  getCellContentWithRowCol,
} from "./SheetUtils";
import range from "lodash/range";
import { EditorContent } from "./cell-id-picking/cell-id-picking.store";

import { tzOffsets, mockTz } from "./mockTimezone";

const gridFromValueMatrix = (valueMatrix: GridElement["value"][][]): GridElement[][] =>
  valueMatrix.map((row) =>
    row.map((value) => ({
      value,
      expression: value ? String(value) : null,
    }))
  );

test("parsing cells", () => {
  expect(a1ColToIx("A$2")).toStrictEqual({ colIx: 0, length: 1 });
  expect(a1ColToIx("AB4")).toStrictEqual({ colIx: 27, length: 2 });
  expect(a1ColToIx("ab4")).toStrictEqual({ colIx: 27, length: 2 });
});

test("Create Grid", () => {
  const grid = createGrid(10, 10);
  expect(grid[0][0].readOnly);
});

test("Extend selection", () => {
  const grid = createGrid(10, 10);

  function setExpression(x: number, y: number, expression: string) {
    grid[y][x] = {
      value: expression,
      expression: expression,
    };
  }

  setExpression(2, 2, "A1");
});

test("Differentiates between notebook and sheet cells", () => {
  expect(parseCellId("B2")).toEqual({
    x: 1,
    y: 1,
    sheetId: undefined,
    notebookCell: false,
  });
  expect(parseCellId("01")).toEqual({ y: 1, notebookCell: true });
});

it.each([
  [0, 0, "A1"],
  [25, 9, "Z10"],
  [26, 10, "AA11"],
  [27, 0, "AB1"],
  [51, 0, "AZ1"],
  [52, 0, "BA1"],
  [701, 99, "ZZ100"],
  [702, 0, "AAA1"],
  [703, 0, "AAB1"],
])("convertA1(%s, %s, %s)", (x, y, a1) => {
  expect(parseCellId(a1 as string)).toEqual({
    x,
    y,
    sheetId: undefined,
    notebookCell: false,
  });
  expect(toA1(x as number, y as number)).toEqual(a1);
});

test("parse tuple cellId", () => {
  expect(parseCellId("[1, 2, 3]")).toEqual({
    x: 1,
    y: 2,
    sheetId: 3,
    notebookCell: false,
  });
});

test("number_with_decimals", () => {
  expect(numberWithDecimals(100, 5)).toBe("100");
  expect(numberWithDecimals(200.11111, 7)).toBe("200.111");
  expect(numberWithDecimals(200.11111, 4)).toBe("200");
  expect(numberWithDecimals(200.19999, 5)).toBe("200.2");
  expect(numberWithDecimals(200.19999, 7)).toBe("200.2");
});

test.each<[SheetUnawareCellId, CellAttribute, boolean]>([
  [[0, 0], CellAttribute.BgColor, true],
  [[1, 0], CellAttribute.BgColor, false],
  [[1, 0], CellAttribute.IsProtected, true],
])("canChangeCellAttributes(%s, %s, %s)", (cell, attributeName, canChange) => {
  const grid: GridElement[][] = [
    [
      {
        value: "foo",
        expression: "foo",
      },
      {
        value: "bar",
        expression: "bar",
        attributes: { [CellAttribute.IsProtected]: "1" },
      },
    ],
  ];
  expect(canChangeCellAttributes(grid, cell, attributeName)).toBe(canChange);
});

test.each<[SheetSelection, boolean]>([
  [{ start: { row: 0, col: 0 }, end: { row: 0, col: 0 } }, false],
  [{ start: { row: 0, col: 0 }, end: { row: 0, col: 1 } }, true],
  [{ start: { row: 0, col: 1 }, end: { row: 0, col: 1 } }, true],
])("hasSelectionProtectedCells(%j, %s)", (selection, hasProtectedCells) => {
  const grid: GridElement[][] = [
    [
      {
        value: "foo",
        expression: "foo",
      },
      {
        value: "bar",
        expression: "bar",
        attributes: { [CellAttribute.IsProtected]: "1" },
      },
    ],
  ];
  expect(hasSelectionProtectedCells(grid, selection)).toBe(hasProtectedCells);
});

test.each<[string, string, string]>([
  ["", "bold", "bold"],
  ["bold", "bold", ""],
  ["bold italic", "bold", "italic"],
  ["bold", "italic", "bold italic"],
])("getUpdatedTextStyle(%s, %s) === %s", (currentValue, update, result) =>
  expect(getUpdatedTextStyle(currentValue, update)).toBe(result)
);

test.each<[Dimension, ("row" | "col")[]]>([
  [Dimension.Col, ["row", "col"]],
  [Dimension.Row, ["col", "row"]],
])("getDimensionNames(%s) === %s", (arg, result) =>
  expect(getDimensionNames(arg)).toEqual(result)
);

test.each<[SheetSelection, Dimension, number[]]>([
  [{ start: { row: 0, col: 0 }, end: { row: 0, col: 0 } }, Dimension.Row, [0]],
  [{ start: { row: 0, col: 0 }, end: { row: 0, col: 0 } }, Dimension.Col, [0]],
  [
    { start: { row: 2, col: 0 }, end: { row: 200, col: 0 } },
    Dimension.Row,
    _.range(2, 200 + 1),
  ],
  [{ start: { row: 2, col: 0 }, end: { row: 200, col: 0 } }, Dimension.Col, [0]],
  [
    { start: { row: 0, col: 2 }, end: { row: 0, col: 200 } },
    Dimension.Col,
    _.range(2, 200 + 1),
  ],
  [{ start: { row: 0, col: 2 }, end: { row: 0, col: 200 } }, Dimension.Row, [0]],
])("getRangeOfSelectedDimensions(%s, %s) === %s", (selection, dimension, result) =>
  expect(getRangeOfSelectedDimensions(selection, dimension)).toEqual(result)
);

test("resize grid", () => {
  const grid: GridElement[][] = createGrid(20, 20);
  grid[5][5].value = "foo";
  const smallerGrid = resizeGrid(grid, 19, 19);
  expect(smallerGrid[5][5].value).toBe("foo");
  expect(smallerGrid.length).toBe(19);
  for (let row of smallerGrid) {
    expect(row.length).toBe(19);
  }

  const biggerGrid = resizeGrid(grid, 21, 21);
  expect(biggerGrid[5][5].value).toBe("foo");
  expect(biggerGrid.length).toBe(21);
  for (let row of biggerGrid) {
    expect(row.length).toBe(21);
  }
});

test.each<[string, SheetSelection, number[], number[]]>([
  [
    "Normalized selection",
    {
      start: {
        row: 1,
        col: 1,
      },
      end: {
        row: 6,
        col: 7,
      },
    },
    range(1, 7),
    range(1, 8),
  ],
  [
    "Reverse selection",
    {
      start: {
        row: 6,
        col: 7,
      },
      end: {
        row: 1,
        col: 1,
      },
    },
    range(1, 7),
    range(1, 8),
  ],
])(
  "getSelectionClearChanges covers entire selection(%s)",
  (_, selection, clearedRows, clearedColumns) => {
    const changes = getSelectionClearChanges(selection);

    for (const row of clearedRows)
      for (const col of clearedColumns)
        expect(
          changes.splice(
            changes.findIndex((change) => change.row === row && change.col === col),
            1
          )[0]
        ).not.toBeUndefined();

    expect(changes.length).toBe(0);
  }
);

test.each<[string, boolean, string | number]>([
  ["12.2%", true, 0.122],
  ["hello", false, "hello"],
  ["13 %", true, 0.13],
  ["12%", true, 0.12],
  ["-2%", true, -0.02],
  [".2%", true, 0.002],
])("verify isPercentageValue: (%s)", (currentValue, isPercentage, result) => {
  const [wasPercentage, newValue] = isPercentageValue(currentValue);
  expect(wasPercentage).toBe(isPercentage);
  expect(newValue).toBe(result);
});

test.each<[string, boolean, string | number]>([
  ["12.2%", false, "12.2%"],
  ["hello", false, "hello"],
  ["13$", true, 13],
  ["12 $", true, 12],
  ["$11", true, 11],
  ["$1 000", true, 1000], // excel-style clipboard
  ["$ 10", true, 10],
])("verify isCurrencyValue: (%s)", (currentValue, isCurrency, result) => {
  const [wasCurrency, newValue] = isCurrencyValue(currentValue);
  expect(wasCurrency).toBe(isCurrency);
  expect(newValue).toBe(result);
});

test.each<[number, string | undefined, string]>([
  [44853, undefined, "10/19/2022"],
  [44853, "yyyy-MM-dd", "2022-10-19"],
])(
  `format as a date: formatNumber(%s, ${NumberFormat.Date}, %s) === %s`,
  (value, subformat, result) => {
    const originalDate = global.Date;
    for (const offset of tzOffsets) {
      mockTz(offset);
      expect(formatNumber(value, NumberFormat.Date, subformat)).toBe(result);
    }
    global.Date = originalDate;
  }
);

test.each<[number, NumberFormat | undefined, string | undefined, string]>([
  [0, undefined, undefined, "0"],
  [10, undefined, undefined, "10"],
  [10, NumberFormat.Money, undefined, "$10.00"],
  [10, NumberFormat.Money, "€", "€10.00"],
  [0.999999, NumberFormat.Percentage, undefined, "100%"],
  [0.0999999, NumberFormat.Percentage, undefined, "10%"],
  [0.432, NumberFormat.Percentage, undefined, "43%"],
  [10.1, NumberFormat.Integer, undefined, "10"],
  [10.1, NumberFormat.Float, undefined, "10.1"],
  [10.1, NumberFormat.Float, "2", "10.10"],
])("formatNumber(%s, %s, %s) === %s", (value, format, subformat, result) => {
  expect(formatNumber(value, format, subformat)).toBe(result);
});

test.each<[string, number, boolean, string]>([
  ["0.0%", 0, true, "0.00%"],
  ['"$"#,##00', 0, true, '"$"#,##00.0'],
  ['"$"#,##0.00', 0, false, '"$"#,##0.0'],
  ["0.0%", 0, false, "0%"],
  ["0", 0, true, "0.0"],
  ["0.", 0, true, "0.0"],
  ["General", 1, true, "0.0"],
  ["General", 1.1, true, "0.00"],
])(
  "changeNumberOfDecimals(%s, %s, %s, %s)",
  (customFormat, value, increase, result) => {
    expect(changeNumberOfDecimals(customFormat, value, increase)).toBe(result);
  }
);

describe("skipContiguousCells", () => {
  it.each<[Dimension, -1 | 1]>([
    [Dimension.Row, -1],
    [Dimension.Row, 1],
    [Dimension.Col, -1],
    [Dimension.Col, 1],
  ])(
    "Returns single cell selection (dimension: %s, direction: %s)",
    (dimension, direction) => {
      const nextSelection = skipContiguousCells(
        dimension,
        direction,
        gridFromValueMatrix([
          [0, 1, 2],
          [0, 1, 2],
          //  ^ - we're here
          [0, 1, 2],
        ]),
        {
          row: 1,
          col: 1,
        },
        [0, 1, 2]
      );

      expect(nextSelection.start).toMatchObject(nextSelection.end);
    }
  );

  const mainGrid = gridFromValueMatrix(
    // prettier-ignore
    [
// j    0     1     2     3     4     5     6     7     8        i
      [null, null, null, null, null, null, null, null, null], // 0
      [null, "va", "va", "va", "va", "va", "va", "va", null], // 1
      [null, "va", null, null, "va", null, null, "va", null], // 2
      [null, "va", null, null, "va", null, null, "va", null], // 3
      [null, "va", "va", "va", "va", "va", "va", "va", null], // 4
      [null, "va", null, null, "va", null, null, "va", null], // 5
      [null, "va", null, null, "va", null, null, "va", null], // 6
      [null, "va", "va", "va", "va", "va", "va", "va", null], // 7
      [null, null, null, null, null, null, null, null, null], // 8
    ]
  );

  it.each<
    [
      name: string,
      dimension: Dimension,
      direction: -1 | 1,
      initialPosition: SheetLocation,
      targetPosition: SheetLocation
    ]
  >([
    [
      "Current empty, next value",
      Dimension.Col,
      1,
      { row: 2, col: 3 },
      { row: 2, col: 4 },
    ],
    [
      "Current empty, next value",
      Dimension.Col,
      -1,
      { row: 2, col: 5 },
      { row: 2, col: 4 },
    ],
    [
      "Current empty, next value",
      Dimension.Row,
      1,
      { row: 3, col: 3 },
      { row: 4, col: 3 },
    ],
    [
      "Current empty, next value",
      Dimension.Row,
      -1,
      { row: 5, col: 3 },
      { row: 4, col: 3 },
    ],
    [
      "Current empty, next empty",
      Dimension.Col,
      1,
      { row: 2, col: 2 },
      { row: 2, col: 4 },
    ],
    [
      "Current empty, next empty",
      Dimension.Col,
      -1,
      { row: 2, col: 6 },
      { row: 2, col: 4 },
    ],
    [
      "Current empty, next empty",
      Dimension.Row,
      1,
      { row: 2, col: 3 },
      { row: 4, col: 3 },
    ],
    [
      "Current empty, next empty",
      Dimension.Row,
      -1,
      { row: 6, col: 3 },
      { row: 4, col: 3 },
    ],
    [
      "Current value, next empty",
      Dimension.Col,
      1,
      { row: 2, col: 1 },
      { row: 2, col: 4 },
    ],
    [
      "Current value, next empty",
      Dimension.Col,
      -1,
      { row: 2, col: 7 },
      { row: 2, col: 4 },
    ],
    [
      "Current value, next empty",
      Dimension.Row,
      1,
      { row: 1, col: 3 },
      { row: 4, col: 3 },
    ],
    [
      "Current value, next empty",
      Dimension.Row,
      -1,
      { row: 7, col: 3 },
      { row: 4, col: 3 },
    ],
    [
      "Current value, next value",
      Dimension.Col,
      1,
      { row: 4, col: 4 },
      { row: 4, col: 7 },
    ],
    [
      "Current value, next value",
      Dimension.Col,
      -1,
      { row: 4, col: 4 },
      { row: 4, col: 1 },
    ],
    [
      "Current value, next value",
      Dimension.Row,
      1,
      { row: 4, col: 4 },
      { row: 7, col: 4 },
    ],
    [
      "Current value, next value",
      Dimension.Row,
      -1,
      { row: 4, col: 4 },
      { row: 1, col: 4 },
    ],
    [
      "Current value, next  edge",
      Dimension.Col,
      1,
      { row: 4, col: 7 },
      { row: 4, col: 8 },
    ],
    [
      "Current value, next  edge",
      Dimension.Col,
      -1,
      { row: 4, col: 1 },
      { row: 4, col: 0 },
    ],
    [
      "Current value, next  edge",
      Dimension.Row,
      1,
      { row: 7, col: 4 },
      { row: 8, col: 4 },
    ],
    [
      "Current value, next  edge",
      Dimension.Row,
      -1,
      { row: 1, col: 4 },
      { row: 0, col: 4 },
    ],
    [
      "Current  edge, next  edge",
      Dimension.Col,
      1,
      { row: 4, col: 8 },
      { row: 4, col: 8 },
    ],
    [
      "Current  edge, next  edge",
      Dimension.Col,
      -1,
      { row: 4, col: 0 },
      { row: 4, col: 0 },
    ],
    [
      "Current  edge, next  edge",
      Dimension.Row,
      1,
      { row: 8, col: 4 },
      { row: 8, col: 4 },
    ],
    [
      "Current  edge, next  edge",
      Dimension.Row,
      -1,
      { row: 0, col: 4 },
      { row: 0, col: 4 },
    ],
  ])(
    "%s (dimension: %s, direction: %s)",
    (_, dimension, direction, initialPosition, targetPosition) => {
      expect(
        skipContiguousCells(
          dimension,
          direction,
          mainGrid,
          initialPosition,
          [0, 1, 2, 3, 4, 5, 6, 7, 8]
        ).end
      ).toMatchObject(targetPosition);
    }
  );

  it.each<
    [
      name: string,
      dimension: Dimension,
      direction: -1 | 1,
      initialPosition: SheetLocation,
      targetPosition: SheetLocation
    ]
  >([
    [
      "Current value, next value",
      Dimension.Col,
      1,
      { row: 4, col: 4 },
      { row: 4, col: 6 },
    ],
    [
      "Current value, next value",
      Dimension.Col,
      -1,
      { row: 4, col: 4 },
      { row: 4, col: 2 },
    ],
    [
      "Current value, next value",
      Dimension.Row,
      1,
      { row: 4, col: 4 },
      { row: 6, col: 4 },
    ],
    [
      "Current value, next value",
      Dimension.Row,
      -1,
      { row: 4, col: 4 },
      { row: 2, col: 4 },
    ],
    [
      "Current value, next  edge",
      Dimension.Col,
      1,
      { row: 2, col: 4 },
      { row: 2, col: 8 },
    ],
    [
      "Current value, next  edge",
      Dimension.Col,
      -1,
      { row: 2, col: 4 },
      { row: 2, col: 0 },
    ],
    [
      "Current value, next  edge",
      Dimension.Row,
      1,
      { row: 4, col: 2 },
      { row: 8, col: 2 },
    ],
    [
      "Current value, next  edge",
      Dimension.Row,
      -1,
      { row: 4, col: 2 },
      { row: 0, col: 2 },
    ],
  ])(
    "%s, edge values hidden (dimension: %s, direction: %s)",
    (_, dimension, direction, initialPosition, targetPosition) => {
      expect(
        skipContiguousCells(
          dimension,
          direction,
          mainGrid,
          initialPosition,
          [0, 2, 3, 4, 5, 6, 8]
        ).end
      ).toMatchObject(targetPosition);
    }
  );

  // In case mode determination will not take into account hidden headers
  // next cell would be last filled one from the next block,
  // while normally in this test set we expect first filled one.
  it.each<
    [
      name: string,
      dimension: Dimension,
      direction: -1 | 1,
      initialPosition: SheetLocation,
      targetPosition: SheetLocation
    ]
  >([
    [
      "Current value, next value",
      Dimension.Col,
      1,
      { row: 4, col: 5 },
      { row: 4, col: 8 },
    ],
    [
      "Current value, next value",
      Dimension.Col,
      -1,
      { row: 4, col: 5 },
      { row: 4, col: 2 },
    ],
    [
      "Current value, next value",
      Dimension.Row,
      1,
      { row: 5, col: 4 },
      { row: 8, col: 4 },
    ],
    [
      "Current value, next value",
      Dimension.Row,
      -1,
      { row: 5, col: 4 },
      { row: 2, col: 4 },
    ],
  ])(
    "%s, next hidden (dimension: %s, direction: %s)",
    (_, dimension, direction, initialPosition, targetPosition) => {
      const grid = gridFromValueMatrix(
        // prettier-ignore
        [
// j    0     1     2     3     4     5     6     7     8     9     10       i
          [null, null, null, null, null, null, null, null, null, null, null], // 0
          [null, "va", "va", "va", "va", "va", "va", "va", "va", "va", null], // 1
          [null, "va", "va", "va", "va", "va", "va", "va", "va", "va", null], // 2
          [null, "va", "va", null, null, "va", null, null, "va", "va", null], // 3
          [null, "va", "va", null, "va", "va", "va", null, "va", "va", null], // 4
          [null, "va", "va", "va", "va", "va", "va", "va", "va", "va", null], // 5
          [null, "va", "va", null, "va", "va", "va", null, "va", "va", null], // 6
          [null, "va", "va", null, null, "va", null, null, "va", "va", null], // 7
          [null, "va", "va", "va", "va", "va", "va", "va", "va", "va", null], // 8
          [null, "va", "va", "va", "va", "va", "va", "va", "va", "va", null], // 9
          [null, null, null, null, null, null, null, null, null, null, null], // 10
        ]
      );
      expect(
        skipContiguousCells(
          dimension,
          direction,
          grid,
          initialPosition,
          [0, 1, 2, 3, 5, 7, 8, 9, 10]
        ).end
      ).toMatchObject(targetPosition);
    }
  );
});

test.each<[string, boolean]>([
  ["something", true],
  ["something something", false],
  ["something_something", true],
  ["something1", true],
  ["1something", false],
  ["_1something", true],
  ["_something", true],
  [".something", false],
  ["some.thing", false],
  ["some#thing", false],
  ["#something", false],
  ["$something", false],
  ["!something", false],
])("isValidPythonName(%s) === %s", (name, isValid) =>
  expect(isValidPythonName(name)).toBe(isValid)
);
test.each<
  [EditorContent, Dimension, number, number, string | undefined, EditorContent]
>([
  [
    {
      value: "",
      dynamicContentStart: 0,
      dynamicContentEnd: 0,
      editorSelection: EditorSelection.single(0),
    },
    Dimension.Row,
    1,
    1,
    undefined,
    {
      value: "1:1",
      dynamicContentStart: 0,
      dynamicContentEnd: 3,
      editorSelection: EditorSelection.single(3),
    },
  ],
  [
    {
      value: "=",
      dynamicContentStart: 1,
      dynamicContentEnd: 1,
      editorSelection: EditorSelection.single(1),
    },
    Dimension.Row,
    1,
    1,
    undefined,
    {
      value: "=1:1",
      dynamicContentStart: 1,
      dynamicContentEnd: 4,
      editorSelection: EditorSelection.single(4),
    },
  ],
  [
    {
      value: "=SUM()",
      dynamicContentStart: 5,
      dynamicContentEnd: 5,
      editorSelection: EditorSelection.single(5),
    },
    Dimension.Row,
    1,
    1,
    undefined,
    {
      value: "=SUM(1:1)",
      dynamicContentStart: 5,
      dynamicContentEnd: 8,
      editorSelection: EditorSelection.single(8),
    },
  ],
  [
    {
      value: "=SUM()",
      dynamicContentStart: 5,
      dynamicContentEnd: 5,
      editorSelection: EditorSelection.single(5),
    },
    Dimension.Col,
    1,
    1,
    undefined,
    {
      value: "=SUM(B:B)",
      dynamicContentStart: 5,
      dynamicContentEnd: 8,
      editorSelection: EditorSelection.single(8),
    },
  ],
  [
    {
      value: "=SUM()",
      dynamicContentStart: 5,
      dynamicContentEnd: 5,
      editorSelection: EditorSelection.single(5),
    },
    Dimension.Col,
    1,
    2,
    undefined,
    {
      value: "=SUM(B:C)",
      dynamicContentStart: 5,
      dynamicContentEnd: 8,
      editorSelection: EditorSelection.single(8),
    },
  ],
  [
    {
      value: "=SUM()",
      dynamicContentStart: 5,
      dynamicContentEnd: 5,
      editorSelection: EditorSelection.single(5),
    },
    Dimension.Col,
    2,
    1,
    undefined,
    {
      value: "=SUM(C:B)",
      dynamicContentStart: 5,
      dynamicContentEnd: 8,
      editorSelection: EditorSelection.single(8),
    },
  ],
])(
  "getCellContentWithRowCol",
  (currentCellContent, dimension, startHeader, endHeader, sheetName, result) =>
    expect(
      getCellContentWithRowCol(
        currentCellContent,
        dimension,
        startHeader,
        endHeader,
        sheetName
      )
    ).toMatchObject(result)
);
