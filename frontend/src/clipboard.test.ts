import "./jestMockJsdom";
import "./jestMockCanvas";

import {
  cellToStyleParams,
  excelClipboardToCell,
  fillSelectionWithClipboard,
  getDataSheetsValueAttribute,
  getFormulaAttribute,
  getHtmlCell,
  getHtmlClipboard,
  getParsedHtmlClipboard,
  getParsedR1C1Expression,
  getPlainTextClipboard,
  htmlClipboardToNeptyneCells,
  StylesFromCell,
  StylesMap,
} from "./clipboard";
import {
  CellAttribute,
  TextAlign,
  TextStyle,
  VerticalAlign,
  LineWrapDefault,
} from "./NeptyneProtocol";
import { GridElement, SheetSelection, SheetLocation } from "./SheetUtils";
import { CellObject } from "xlsx";

const DEFAULT_CELL: GridElement = {
  value: "foo",
  expression: "foo",
  attributes: {},
};

test.each<[GridElement, StylesFromCell]>([
  [
    {
      ...DEFAULT_CELL,
    },
    {
      textAlign: TextAlign.Left,
      fontWeight: "normal",
      fontStyle: "normal",
      verticalAlign: VerticalAlign.Top,
    },
  ],
  [
    {
      ...DEFAULT_CELL,
      value: "1",
    },
    {
      textAlign: TextAlign.Left,
      fontWeight: "normal",
      fontStyle: "normal",
      verticalAlign: VerticalAlign.Top,
    },
  ],
  [
    {
      ...DEFAULT_CELL,
      value: 1,
    },
    {
      textAlign: TextAlign.Right,
      fontWeight: "normal",
      fontStyle: "normal",
      verticalAlign: VerticalAlign.Top,
    },
  ],
  [
    {
      ...DEFAULT_CELL,
      attributes: {
        [CellAttribute.TextStyle]: TextStyle.Bold,
      },
    },
    {
      textAlign: TextAlign.Left,
      fontWeight: "bold",
      fontStyle: "normal",
      verticalAlign: VerticalAlign.Top,
    },
  ],
  [
    {
      ...DEFAULT_CELL,
      attributes: {
        [CellAttribute.TextStyle]: TextStyle.Italic,
      },
    },
    {
      textAlign: TextAlign.Left,
      fontWeight: "normal",
      fontStyle: "italic",
      verticalAlign: VerticalAlign.Top,
    },
  ],
  [
    {
      ...DEFAULT_CELL,
      attributes: {
        [CellAttribute.TextStyle]: `${TextStyle.Italic} ${TextStyle.Bold}`,
      },
    },
    {
      textAlign: TextAlign.Left,
      fontWeight: "bold",
      fontStyle: "italic",
      verticalAlign: VerticalAlign.Top,
    },
  ],
  [
    {
      ...DEFAULT_CELL,
      attributes: {
        [CellAttribute.TextStyle]: `${TextStyle.Bold} ${TextStyle.Italic}`,
      },
    },
    {
      textAlign: TextAlign.Left,
      fontWeight: "bold",
      fontStyle: "italic",
      verticalAlign: VerticalAlign.Top,
    },
  ],
  [
    {
      ...DEFAULT_CELL,
      attributes: {
        [CellAttribute.TextStyle]: `${TextStyle.Bold} ${TextStyle.Italic}`,
        [CellAttribute.VerticalAlign]: VerticalAlign.Bottom,
      },
    },
    {
      textAlign: TextAlign.Left,
      fontWeight: "bold",
      fontStyle: "italic",
      verticalAlign: VerticalAlign.Bottom,
    },
  ],
])("cellToStyleParams", (cell: GridElement, styles: StylesFromCell) => {
  expect(cellToStyleParams(cell)).toEqual(styles);
});

test.each<[SheetSelection, string]>([
  [{ start: { row: 0, col: 0 }, end: { row: 0, col: 0 } }, "foo"],
  [{ start: { row: 0, col: 0 }, end: { row: 0, col: 1 } }, "foo\tbar"],
  [{ start: { row: 0, col: 0 }, end: { row: 1, col: 0 } }, "foo\nbaz"],
  [{ start: { row: 0, col: 0 }, end: { row: 1, col: 1 } }, "foo\tbar\nbaz\t2"],
])("getPlainTextClipboard", (selection, text) => {
  const grid: GridElement[][] = [
    [
      { ...DEFAULT_CELL, value: "foo", expression: "foo" },
      { ...DEFAULT_CELL, value: "bar", expression: "bar" },
    ],
    [
      { ...DEFAULT_CELL, value: "baz", expression: "baz" },
      { ...DEFAULT_CELL, value: 2, expression: "=1+1" },
    ],
  ];
  expect(getPlainTextClipboard(grid, selection)).toBe(text);
});

test.each<[string | null, string]>([
  [null, ""],
  ["", ""],
  ["1", ""],
  ["foo", ""],
  ["=1+1", 'data-sheets-formula="=1+1"'],
  ["=foo", 'data-sheets-formula="=foo"'],
])("getFormulaAttribute(%s) === %s", (formula, attribute) => {
  expect(getFormulaAttribute(formula)).toBe(attribute);
});

test.each<[string | number | null, string]>([
  [1, `data-sheets-value='{"1":3,"3":1}'`],
  [400, `data-sheets-value='{"1":3,"3":400}'`],
  ["20", `data-sheets-value='{"1":2,"2":"20"}'`],
  ["foo", `data-sheets-value='{"1":2,"2":"foo"}'`],
])("getDataSheetsValueAttribute(%s) === %s", (formula, attribute) => {
  expect(getDataSheetsValueAttribute(formula)).toBe(attribute);
});

test.each<[clipboard: string, cells: GridElement[][] | undefined]>([
  ["something bad", []],
  [`<p class="p1">111</p>`, [[{ ...DEFAULT_CELL, value: "111", expression: "111" }]]],
  [
    `<p class="p1"><b>111</b></p>`,
    [
      [
        {
          ...DEFAULT_CELL,
          value: "111",
          expression: "111",
          attributes: { [CellAttribute.TextStyle]: TextStyle.Bold },
        },
      ],
    ],
  ],
  [
    `<p class="p1"><i>111</i></p>`,
    [
      [
        {
          ...DEFAULT_CELL,
          value: "111",
          expression: "111",
          attributes: { [CellAttribute.TextStyle]: TextStyle.Italic },
        },
      ],
    ],
  ],
])("processHtmlClipboard", (clipboard, cells) => {
  const element = document.createElement("div");
  element.innerHTML = clipboard;
  expect(htmlClipboardToNeptyneCells(element, { row: 0, col: 0 })).toEqual(cells);
});

test.each<[string, SheetLocation, string]>([
  ["=1+1", { row: 0, col: 0 }, "=1+1"],
  ["=R[0]C[0]", { row: 0, col: 0 }, "=A1"],
  ["=R[1]C[1]", { row: 0, col: 0 }, "=B2"],
  ["=R[-1]C[-1]", { row: 3, col: 3 }, "=C3"],
  ["=R1C1", { row: 3, col: 3 }, "=$A$1"],
  ["=R1C[0]", { row: 3, col: 3 }, "=D$1"],
  ["=SUM(R[0]C[-1]:R[9]C[-1])", { row: 0, col: 1 }, "=SUM(A1:A10)"],
  ["=R[0]C[-1]+1", { row: 0, col: 0 }, "=REF_ERROR"],
])("getParsedR1C1Expression(%s, %j) === %s", (formula, coordinate, result) => {
  expect(getParsedR1C1Expression(formula, coordinate)).toBe(result);
});

test.each<string>([
  "foo",
  " foo ",
  `
  foo
`,
])('getHtmlCell do not litter the value ("%s")', (value) => {
  const html = getHtmlCell({ ...DEFAULT_CELL, value, expression: value }, false);
  const container = document.createElement("table");
  container.innerHTML = `<tbody><tr>${html}</tr></tbody>`;

  expect(container.querySelector("td")?.innerHTML).toBe(value);
});

test.each<[string, string]>([
  ["foo", "foo"],
  [" foo ", "foo"],
  [
    `
  foo
`,
    "foo",
  ],
])('getParsedHtmlClipboard trims value ("%s")', (value, expected) => {
  const table = `<GOOGLE-SHEETS-HTML-ORIGIN>
      <TABLE>
        <TBODY>
          <TR><TD>${value}</TD></TR>
          <TR><TD>${value}</TD></TR>
        </TBODY>
      </TABLE>
    </GOOGLE-SHEETS-HTML-ORIGIN>`;

  const selection = getParsedHtmlClipboard(table, { row: 0, col: 0 });

  expect(selection[0][0].expression).toBe(expected);
  expect(selection[0][0].value).toBe(expected);
});

test.each<[string, number]>([
  ["single value", 0],
  ["multiple value", 2],
])("getHtmlClipboard escapes formula (%s)", (_, additionalElements) => {
  const expression = `=b="val"`;
  const emptyGridElement: GridElement = {
    value: "",
    expression: "",
  };
  const grid: GridElement[][] = [
    [
      {
        value: "42",
        expression,
      },
      ...Array(additionalElements).fill(emptyGridElement),
    ],
  ];
  const html = getHtmlClipboard(
    grid,
    {
      start: {
        row: 0,
        col: 0,
      },
      end: {
        row: 0,
        col: additionalElements,
      },
    },
    undefined
  );
  const container = document.createElement("div");
  container.id = "testcontainer";
  container.innerHTML = html;
  document.body.append(container);
  expect(
    document
      .querySelector(
        `#testcontainer ${additionalElements > 0 ? "td" : "span"}[data-sheets-formula]`
      )
      ?.getAttribute("data-sheets-formula")
  ).toBe(expression);
  container.remove();
});

test.each<[string, GridElement[][], SheetSelection, GridElement[][]]>([
  [
    "fills selection by one cell",
    [[DEFAULT_CELL]],
    { start: { row: 0, col: 0 }, end: { row: 3, col: 4 } },
    [
      [DEFAULT_CELL, DEFAULT_CELL, DEFAULT_CELL, DEFAULT_CELL, DEFAULT_CELL],
      [DEFAULT_CELL, DEFAULT_CELL, DEFAULT_CELL, DEFAULT_CELL, DEFAULT_CELL],
      [DEFAULT_CELL, DEFAULT_CELL, DEFAULT_CELL, DEFAULT_CELL, DEFAULT_CELL],
      [DEFAULT_CELL, DEFAULT_CELL, DEFAULT_CELL, DEFAULT_CELL, DEFAULT_CELL],
    ],
  ],
  [
    "fills selection by selection",
    [
      [DEFAULT_CELL, DEFAULT_CELL],
      [DEFAULT_CELL, DEFAULT_CELL],
    ],
    { start: { row: 0, col: 0 }, end: { row: 1, col: 3 } },
    [
      [DEFAULT_CELL, DEFAULT_CELL, DEFAULT_CELL, DEFAULT_CELL],
      [DEFAULT_CELL, DEFAULT_CELL, DEFAULT_CELL, DEFAULT_CELL],
    ],
  ],
  [
    "fills selection without overflow",
    [
      [DEFAULT_CELL, DEFAULT_CELL],
      [DEFAULT_CELL, DEFAULT_CELL],
    ],
    { start: { row: 0, col: 0 }, end: { row: 2, col: 4 } },
    [
      [DEFAULT_CELL, DEFAULT_CELL, DEFAULT_CELL, DEFAULT_CELL],
      [DEFAULT_CELL, DEFAULT_CELL, DEFAULT_CELL, DEFAULT_CELL],
    ],
  ],
  [
    "doesn't shrink the value",
    [
      [DEFAULT_CELL, DEFAULT_CELL],
      [DEFAULT_CELL, DEFAULT_CELL],
    ],
    { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
    [
      [DEFAULT_CELL, DEFAULT_CELL],
      [DEFAULT_CELL, DEFAULT_CELL],
    ],
  ],
])("fillSelectionWithClipboard %s", (_, clipboard, selection, expected) => {
  expect(fillSelectionWithClipboard(clipboard, selection)).toEqual(expected);
});

test.each<
  [CellObject | undefined, HTMLTableCellElement | null, StylesMap, GridElement]
>([
  [{} as CellObject, null, {}, { value: null } as GridElement],
  [
    {
      v: "foobar",
    } as CellObject,
    {} as HTMLTableCellElement,
    {},
    {
      value: "foobar",
      expression: "foobar",
      attributes: {
        [CellAttribute.LineWrap]: LineWrapDefault,
      },
    } as GridElement,
  ],
  [
    {
      v: "foobar",
    } as CellObject,
    {
      className: "bar",
    } as HTMLTableCellElement,
    {},
    {
      value: "foobar",
      expression: "foobar",
      attributes: {
        [CellAttribute.LineWrap]: LineWrapDefault,
      },
    } as GridElement,
  ],
  [
    {
      v: "foobar",
    } as CellObject,
    {
      className: "bar",
    } as HTMLTableCellElement,
    {
      ".bar": {
        "font-weight": "bold",
        background: "green",
        color: "white",
        "font-size": "60pt",
      },
    },
    {
      value: "foobar",
      expression: "foobar",
      attributes: {
        [CellAttribute.LineWrap]: LineWrapDefault,
        [CellAttribute.BgColor]: "green",
        [CellAttribute.Color]: "white",
        [CellAttribute.FontSize]: "60",
      },
    } as GridElement,
  ],
])(
  "excelClipboardToCell(%j, %j, %j) === %j",
  (cellObject, htmlCell, stylesMap, result) =>
    expect(excelClipboardToCell(cellObject, htmlCell, stylesMap)).toEqual(result)
);
