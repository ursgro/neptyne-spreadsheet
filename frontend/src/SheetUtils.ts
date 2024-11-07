import { EditorSelection } from "@codemirror/state";
import range from "lodash/range";
import { Decimal } from "decimal.js";

import ReactDataSheet from "./react-datasheet";
import {
  CellAttribute,
  Dimension,
  InsertDeleteContent,
  NumberFormat,
  LineWrap,
  LineWrapDefault,
  SheetTransform,
  SheetUnawareCellId,
  TextAlignDefault,
  TextAlignNumber,
  VerticalAlignDefault,
  CellAttributeUpdate,
} from "./NeptyneProtocol";

import { CellChangeWithRowCol } from "./neptyne-sheet/NeptyneSheet";

import isEmpty from "lodash/isEmpty";
import { EditorContent } from "./cell-id-picking/cell-id-picking.store";
import isNil from "lodash/isNil";
import { formatNumberToText } from "./text-formatter/formatter";

const PCT_VALUE_PATTERN = /-?\d*(\.\d+)?/;
const PCT_SOURCE_MATCH_PATTERN = new RegExp("^" + PCT_VALUE_PATTERN.source + " ?%$");

export const MAX_COLS = 699;

const GENERAL_FORMAT = "General";

export type CellAttributes = {
  [name: string]: string;
};

interface Font {
  label: string;
  cssName: string;
}

export const ALLOWED_FONTS: Font[] = [
  { label: "Sans Serif", cssName: "sans-serif" },
  { label: "Noto Serif", cssName: "notoSerif" },
  { label: "Roboto Mono", cssName: "robotoMono" },
  { label: "Sofia Sans", cssName: "sofiaSansSemicondensed" },
  { label: "Comic Neue", cssName: "comicNeue" },
  { label: "Biryani", cssName: "biryani" },
  { label: "Bodoni Moda", cssName: "bodoniModa" },
  { label: "Cedarville", cssName: "cedarville" },
  { label: "EB Garamond", cssName: "ebGaramond" },
  { label: "Libre Franklin", cssName: "libreFranklin" },
  { label: "Montserrat", cssName: "montserrat" },
  { label: "Open Sans", cssName: "openSans" },
  { label: "Secular One", cssName: "secularOne" },
];

export interface SheetUnawareCellAttributeUpdate
  extends Omit<CellAttributeUpdate, "cellId"> {
  cellId: SheetUnawareCellId;
}

export interface SheetLocation {
  row: number;
  col: number;
}
export interface SheetSelection {
  start: SheetLocation;
  end: SheetLocation;
}
export type OptionalSelection = Partial<SheetSelection>;

export interface GridElement extends ReactDataSheet.Cell<GridElement> {
  value: number | string | null;
  expression: string | null;
  isServerPending?: boolean;
  attributes?: CellAttributes;
  hasOverlappingWidget?: boolean;
  dependsOn?: SheetSelection[];
  rowSpan?: number;
  colSpan?: number;
  mergedInto?: { row: number; col: number };
  renderInline?: boolean;
  overflowFromCol?: number;
  overflowColSpan?: number;
  textPreview?: string;
}

export enum TyneAction {
  New = 1,
  Open,
  Import,
  Copy,
  Clone,
  ImportGoogle,
  OpenLinkedForGsheet,
}

export enum AccessLevel {
  VIEW = "VIEW",
  COMMENT = "COMMENT",
  EDIT = "EDIT",
}

export type CellType = "code" | "markdown" | "raw";

export const dependsOnColors = [
  { border: "#11a9cc", bg: "#e6f6f9" },
  { border: "#b3486d", bg: "#f5e8ec" },
  { border: "#f7981d", bg: "#fef4e8" },
  { border: "#7e3794", bg: "#f1eaf4" },
  { border: "#4285f4", bg: "#ebf2fd" },
  { border: "#f4b400", bg: "#fdf7e5" },
  { border: "#65b045", bg: "#eff6ec" },
  { border: "#795548", bg: "#f1edec" },
  { border: "#999999", bg: "#f4f4f4" },
  { border: "#f1ca3a", bg: "#fdf9ea" },
  { border: "#3f5ca9", bg: "#ebeef6" },
  { border: "#c3d03f", bg: "#f8faeb" },
];

export function quickEvalExpression(value: string) {
  if (isFormulaValue(value)) {
    return "...";
  }

  return value;
}

export interface ParsedNotebookCell {
  y: number;
  notebookCell: true;
}

export interface ParsedSheetCell {
  x: number;
  y: number;
  sheetId?: number;
  notebookCell: false;
}

export interface CutState {
  selection: SheetSelection;
  id: string;
  sheetId: number;
}

type ParsedCell = ParsedNotebookCell | ParsedSheetCell;

/**
 * Data class that contains the border data of selection.
 *
 * Selection cannot be used for this directly, since start of selection can be lower
 * than its end.
 */
export interface SelectionRectangle {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export function a1ColToIx(address: string): { colIx: number; length: number } {
  address = address.toUpperCase();
  let colIx = 0;
  let i = 0;
  for (; i < address.length; i++) {
    const char = address.charAt(i);
    if (("0" <= char && char <= "9") || char === "$") {
      break;
    }
    colIx = colIx * 26 + 1;
    colIx += char.charCodeAt(0) - 65;
  }
  colIx -= 1;
  return { colIx, length: i };
}

export function colIxToA1(x: number): string {
  const parts: string[] = [];
  while (true) {
    const mod = x % 26;
    const col = String.fromCharCode(mod + 65);
    parts.unshift(col);
    if (x < 26) {
      break;
    }
    x = x / 26 - 1;
  }
  return parts.join("");
}

export function parseSheetCellId(address: string) {
  const { colIx, length } = a1ColToIx(address);

  const y = parseInt(address.substring(length), 10) - 1;
  return { x: colIx, y };
}

export function parseCellId(address: string | [number, number, number]): ParsedCell {
  if (Array.isArray(address)) {
    const [x, y, sheetId] = address;
    return {
      x,
      y,
      sheetId,
      notebookCell: false,
    };
  }
  if (address.charAt(0) === "[") {
    const [x, y, sheetId] = JSON.parse(address);
    return { x, y, sheetId, notebookCell: false };
  }
  if (address.charAt(0) < "A" || address.charAt(0) > "Z") {
    return { y: parseInt(address), notebookCell: true };
  }

  return { ...parseSheetCellId(address), notebookCell: false };
}

// For use in cases where sheet cell IDs should not be aware of the sheet ID.
// (In general, NeptyneSheet does not need to konw its ID.)
export const SHEET_UNAWARE = -1;

export function toCellId(x: number, y: number, sheetId: number): string {
  return `[${x}, ${y}, ${sheetId}]`;
}

export function toA1(
  x: number,
  y: number,
  isXAbsolute: boolean = false,
  isYAbsolute: boolean = false
): string {
  const xPrefix = isXAbsolute ? "$" : "";
  const yPrefix = isYAbsolute ? "$" : "";
  return `${xPrefix}${colIxToA1(x)}${yPrefix}${y + 1}`;
}

export function createGridElement(): GridElement {
  return {
    value: "",
    expression: null,
  };
}

export function createGridRow(size: number): GridElement[] {
  const r: GridElement[] = new Array(size);
  for (let i = 0; i < size; i++) {
    r[i] = createGridElement();
  }
  return r;
}

export function createGrid(gridWidth: number, gridHeight: number): GridElement[][] {
  gridWidth = Math.min(gridWidth, MAX_COLS);
  return new Array(gridHeight).fill(null).map(() => createGridRow(gridWidth));
}

export const isEmptyCell = (cell: GridElement): boolean =>
  (cell.value === "" || cell.value === null) &&
  (cell.expression === "" || cell.expression === null) &&
  (!cell.attributes || Object.keys(cell.attributes).length === 0);

export function resizeGrid(
  grid: GridElement[][],
  gridWidth: number,
  gridHeight: number
) {
  function resizeRow(row: GridElement[], rowSize: number) {
    if (row.length < rowSize) {
      return row.concat(new Array(rowSize - row.length).fill(createGridElement()));
    } else if (row.length > rowSize) {
      return row.slice(0, rowSize);
    }
    return row;
  }

  gridWidth = Math.min(gridWidth, MAX_COLS);

  if (grid.length < gridHeight) {
    grid = grid.concat(new Array(gridHeight - grid.length).fill([]));
  } else {
    grid = grid.slice(0, gridHeight);
  }
  return grid.map((row) => resizeRow(row, gridWidth));
}

export function numberWithDecimals(n: number, target_size: number) {
  const rendered = "" + n;
  const p = rendered.indexOf(".");
  if (p === -1) {
    return rendered;
  }
  const decimals = target_size - p - 1;
  if (decimals > 0) {
    const fixed = n.toFixed(decimals);
    let p = fixed.length;
    while (p > 0 && ["0", "."].includes(fixed[p - 1])) {
      p--;
      if (fixed[p] === ".") {
        break;
      }
    }
    return fixed.substr(0, p);
  } else {
    return rendered.substr(0, p);
  }
}

export const percentageToNumber = (value: string) => {
  const parsedValue = value.match(PCT_VALUE_PATTERN);
  if (parsedValue) {
    return parseFloat(parsedValue[0]) / 100;
  }

  return 0;
};

export const currencyToNumber = (value: string) => {
  const parsedValue = value.match(/\d+(\.\d+)?/g);
  if (parsedValue) {
    return parseFloat(parsedValue[0]);
  }

  return 0;
};

/**
 * Returns react-datasheet coordinates for provided coordinates.
 */
export function coordsToCellSelection(row: number, column: number): SheetSelection {
  return {
    start: {
      row: row,
      col: column,
    },
    end: {
      row: row,
      col: column,
    },
  };
}

export const getVerticalAlignClasses = (cell: GridElement) =>
  "cell-format-vertical-align-" +
  (cell.attributes?.[CellAttribute.VerticalAlign] ?? VerticalAlignDefault);

export const attributesToCssClass = (
  cell: GridElement,
  isSelected: boolean,
  defaultClassName: string,
  isCodeCell: boolean,
  isEditing: boolean,
  areGridlinesHidden: boolean
) => {
  const attributes = cell.attributes;
  const classes = [defaultClassName];
  if (!isCodeCell || !isSelected || !isEditing) {
    const defaultTextAlignment =
      typeof cell.value === "number" ? TextAlignNumber : TextAlignDefault;
    classes.push(
      "cell-format-text-align-" +
        (attributes?.[CellAttribute.TextAlign] ?? defaultTextAlignment)
    );
    classes.push(getVerticalAlignClasses(cell));

    if (areGridlinesHidden) classes.push("cell-format-hidden-gridlines");

    if (attributes) {
      if (attributes[CellAttribute.Class]) {
        classes.push(attributes[CellAttribute.Class]);
      }
      if (attributes[CellAttribute.TextStyle]) {
        const styles = attributes[CellAttribute.TextStyle].split(" ");
        for (let style of styles) {
          classes.push("cell-format-" + style);
        }
      }
      if (attributes[CellAttribute.Link]) {
        classes.push("cell-format-url");
      }
      if (attributes[CellAttribute.NumberFormat]) {
        classes.push("cell-format-format-" + attributes[CellAttribute.NumberFormat]);
      }
      if (attributes[CellAttribute.Note]) {
        classes.push("cell-note");
      }
      if (attributes[CellAttribute.Border]) {
        const styles = attributes[CellAttribute.Border].split(" ");
        for (let style of styles) {
          classes.push("cell-format-" + style);
        }
      }
    }
  }
  if (executionPolicy(cell) > 0) {
    classes.push("with-timer");
  }
  if (isSelected) {
    classes.push("first-selected-cell");
  }
  if (isCellProtected(cell)) {
    classes.push("protected");
  }
  const lineWrap = attributes?.[CellAttribute.LineWrap] ?? LineWrapDefault;
  if (lineWrap === LineWrap.Truncate) {
    classes.push("cell-truncate-mode");
  }
  if (lineWrap === LineWrap.Wrap) {
    classes.push("cell-autosize-mode");
  }
  if (lineWrap === LineWrap.Overflow) {
    classes.push("cell-overflow-mode");
  }
  return classes.join(" ");
};

export const executionPolicy = (cell: GridElement) => {
  const attributes = cell.attributes;
  if (attributes && attributes[CellAttribute.ExecutionPolicy]) {
    return parseInt(attributes[CellAttribute.ExecutionPolicy]);
  }
  return 0;
};

/**
 * Extracts extremum points of selection.
 */
export const selectionToRect = (selection: SheetSelection): SelectionRectangle => {
  const top = Math.min(selection.start.row, selection.end.row);
  const bottom = Math.max(selection.start.row, selection.end.row);
  const left = Math.min(selection.start.col, selection.end.col);
  const right = Math.max(selection.start.col, selection.end.col);

  return { top, bottom, left, right };
};

export const rectToSelection = (rect: SelectionRectangle): SheetSelection => ({
  start: {
    row: rect.top,
    col: rect.left,
  },
  end: {
    row: rect.bottom,
    col: rect.right,
  },
});

export const isInSelection = (
  selectionBorders: SelectionRectangle,
  row: number,
  col: number
): boolean => {
  return (
    selectionBorders.top <= row &&
    selectionBorders.bottom >= row &&
    selectionBorders.left <= col &&
    selectionBorders.right >= col
  );
};

export const isValidPythonName = (name: string): boolean =>
  !!name.match(/^([a-zA-Z_][a-zA-Z\d_]*)$/g);

const getSheetNamePrefix = (name: string): string =>
  `${isValidPythonName(name) ? name : `"${name.replace(/"/g, '\\"')}"`}!`;

export const getCellContentWithRowCol = (
  cellContent: EditorContent,
  dimension: Dimension,
  indexStart: number,
  indexEnd: number,
  sheetName?: string
): EditorContent => {
  const sheetNamePrefix = sheetName ? getSheetNamePrefix(sheetName) : "";
  const reference = `${sheetNamePrefix}${
    dimension === Dimension.Row
      ? `${indexStart}:${indexEnd}`
      : `${colIxToA1(indexStart)}:${colIxToA1(indexEnd)}`
  }`;

  cellContent.value =
    cellContent.value.substring(0, cellContent.dynamicContentStart) +
    reference +
    cellContent.value.substring(cellContent.dynamicContentEnd);
  cellContent.dynamicContentEnd = cellContent.dynamicContentStart + reference.length;
  cellContent.editorSelection = EditorSelection.single(cellContent.dynamicContentEnd);
  return cellContent;
};

export const getCellContentWithSelection = (
  cellContent: EditorContent,
  selection: SheetSelection,
  sheetName?: string
): EditorContent => {
  const sheetNamePrefix = sheetName ? getSheetNamePrefix(sheetName) : "";
  const reference = `${sheetNamePrefix}${selectionToA1(selection)}`;

  cellContent.value =
    cellContent.value.substring(0, cellContent.dynamicContentStart) +
    reference +
    cellContent.value.substring(cellContent.dynamicContentEnd);
  cellContent.dynamicContentEnd = cellContent.dynamicContentStart + reference.length;
  cellContent.editorSelection = EditorSelection.single(cellContent.dynamicContentEnd);
  return cellContent;
};

export const selectionToA1 = (selection: SheetSelection): string => {
  const { start, end } = getNormalizedSelection(selection);
  if (start.row === end.row && start.col === end.col) {
    return toA1(start.col, start.row);
  }
  return `${toA1(start.col, start.row)}:${toA1(end.col, end.row)}`;
};

export const parseSheetSelection = (selection: string): SheetSelection => {
  const p = selection.indexOf(":");
  if (p === -1) {
    const { x, y } = parseSheetCellId(selection);
    return { start: { row: y, col: x }, end: { row: y, col: x } };
  }
  const start = parseSheetCellId(selection.substring(0, p));
  const end = parseSheetCellId(selection.substring(p + 1));
  return { start: { row: start.y, col: start.x }, end: { row: end.y, col: end.x } };
};

export const canChangeCellAttributes = (
  grid: GridElement[][],
  cell: SheetUnawareCellId,
  attributeName: string
): boolean => {
  const [x, y] = cell;
  if (!grid?.[y]?.[x]) {
    return true;
  }
  const { attributes } = grid[y][x];
  if (!attributes) {
    return true;
  }
  return (
    attributes?.[CellAttribute.IsProtected] !== "1" ||
    attributeName === CellAttribute.IsProtected
  );
};

export const isCellProtected = (
  cell?: GridElement,
  appModeRestricted?: boolean
): boolean => {
  if (!cell) {
    return !!appModeRestricted;
  }
  const { attributes } = cell;
  if (appModeRestricted) {
    return attributes?.[CellAttribute.IsProtected] !== "0";
  }
  return attributes?.[CellAttribute.IsProtected] === "1";
};

export const hasWidget = (
  grid: GridElement[][],
  sheetSelection: SheetSelection
): boolean => {
  const cell = grid[sheetSelection.start.row][sheetSelection.start.col];
  return !!cell.attributes?.[CellAttribute.WidgetName];
};

export const hasOverlappingWidget = (cell: GridElement): boolean =>
  !!cell.hasOverlappingWidget;

export const hasSelectionProtectedCells = (
  grid: GridElement[][],
  sheetSelection: SheetSelection
): boolean => {
  const {
    left: minX,
    right: maxX,
    top: minY,
    bottom: maxY,
  } = selectionToRect(sheetSelection);
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      if (grid[y][x]?.attributes?.[CellAttribute.IsProtected] === "1") {
        return true;
      }
    }
  }
  return false;
};

/**
 * Returns selection that covers the same cells, but begins at top-left and ends at bottom-right.
 */
export const getNormalizedSelection = (
  sheetSelection: SheetSelection
): SheetSelection => rectToSelection(selectionToRect(sheetSelection));

export const rectToCells = (
  selectionRectangle: SelectionRectangle,
  grid: GridElement[][]
): GridElement[][] =>
  range(selectionRectangle.top, selectionRectangle.bottom + 1).map((row) =>
    range(selectionRectangle.left, selectionRectangle.right + 1).map(
      (col) => grid[row][col]
    )
  );

export const isSelectionEqual = (
  selection1: SheetSelection,
  selection2: SheetSelection
): boolean => {
  const rect1 = selectionToRect(selection1);
  const rect2 = selectionToRect(selection2);
  return (
    rect1.left === rect2.left &&
    rect1.top === rect2.top &&
    rect1.right === rect2.right &&
    rect1.bottom === rect2.bottom
  );
};

export const forEachCell = (
  cells: GridElement[][],
  callback: (cell: GridElement, coordinates: SheetLocation) => void
) => {
  cells.forEach((row, i) => {
    row.forEach((cell, j) => {
      callback(cell, { row: i, col: j });
    });
  });
};

export const getSelectionForData = (
  start: SheetLocation,
  cells: GridElement[][]
): SheetSelection => {
  const width = cells.length ? cells[0].length : 0;
  const height = cells.length;
  return {
    start: start,
    end: { row: start.row - 1 + height, col: start.col - 1 + width },
  };
};

/**
 * We store text style as a string with rules separated with whitespace.
 *
 * This function adds or removes "update" style of the existing value.
 */
export const getUpdatedTextStyle = (currentStyles: string, update: string): string => {
  const styles = new Set<string>(currentStyles ? currentStyles.split(" ") : []);
  if (styles.has(update)) {
    styles.delete(update);
  } else {
    styles.add(update);
  }
  return Array.from(styles).join(" ");
};

export const getSelectedDimensions = (
  dimension: Dimension,
  startCoord: number,
  endCoord: number,
  dimensionLength: number
): SheetSelection => {
  if (dimension === Dimension.Row) {
    return {
      start: { row: startCoord, col: 0 },
      end: { row: endCoord, col: dimensionLength },
    };
  }
  return {
    start: { row: 0, col: startCoord },
    end: { row: dimensionLength, col: endCoord },
  };
};

export const isEntireDimensionSelected = (
  grid: GridElement[][],
  selection: SheetSelection,
  dimension: Dimension
): boolean => {
  const normalizedSelection = getNormalizedSelection(selection);
  const isCol = dimension === Dimension.Col;
  const dimensionLength = isCol ? grid.length : grid[0]?.length || 0;

  const [dimensionName] = getDimensionNames(dimension);
  const selectionCellNumber =
    normalizedSelection.end[dimensionName] -
    normalizedSelection.start[dimensionName] +
    1;

  return dimensionLength === selectionCellNumber;
};

export const getRangeOfSelectedDimensions = (
  selection: SheetSelection,
  dimension: Dimension
) => {
  const [, oppositeDimensionName] = getDimensionNames(dimension);
  const normalizedSelection = getNormalizedSelection(selection);

  return range(
    normalizedSelection.start[oppositeDimensionName],
    normalizedSelection.end[oppositeDimensionName] + 1
  );
};

export const getDimensionNames = (dimension: Dimension): ("row" | "col")[] =>
  dimension === Dimension.Col ? ["row", "col"] : ["col", "row"];

export const getSelectionClearChanges = (
  selection: SheetSelection
): CellChangeWithRowCol[] => {
  const normalizedSelection = getNormalizedSelection(selection);

  return range(normalizedSelection.start.row, normalizedSelection.end.row + 1).flatMap(
    (rowIndex) =>
      range(normalizedSelection.start.col, normalizedSelection.end.col + 1).map(
        (colIndex) => ({
          row: rowIndex,
          col: colIndex,
          value: null,
          attributes: {},
        })
      )
  );
};

export const getSelectionClearChangesWithAttributes = (
  grid: GridElement[][],
  selection: SheetSelection
): CellChangeWithRowCol[] => {
  const normalizedSelection = getNormalizedSelection(selection);

  return range(normalizedSelection.start.row, normalizedSelection.end.row + 1).flatMap(
    (rowIndex) =>
      range(normalizedSelection.start.col, normalizedSelection.end.col + 1).map(
        (colIndex) => ({
          row: rowIndex,
          col: colIndex,
          value: null,
          attributes: grid[rowIndex][colIndex].attributes,
        })
      )
  );
};

export const isPercentageValue = (
  value: string | number
): [boolean, string | number, number] => {
  if (value && typeof value === "string") {
    const valueToParse = value.trim();
    const isPercent = PCT_SOURCE_MATCH_PATTERN.test(valueToParse);

    if (isPercent) {
      const extractedValue = valueToParse.match(PCT_VALUE_PATTERN);
      const precision = extractedValue
        ? extractedValue[0].split(".")[1]?.length ?? 0
        : 0;
      return [
        isPercent,
        extractedValue ? percentageToNumber(extractedValue[0]) : "",
        precision,
      ];
    }
  }
  return [false, value, 0];
};

export const isCurrencyValue = (value: string | number): [boolean, string | number] => {
  if (typeof value === "string") {
    const valueToParse = value.trim();
    // matches strings that contain decimal and a currency sign before/after the decimal
    const isCurrency = /(^(\d| )+(\.(\d| )+)? ?\$$)|(^\$ ?(\d| )+(\.(\d| )+)?$)/.test(
      valueToParse
    );

    if (isCurrency) {
      return [isCurrency, currencyToNumber(valueToParse.replaceAll(/ /g, ""))];
    }
  }
  return [false, value];
};

export const toCustomNumberFormat = (
  numberFormat?: NumberFormat,
  subformat?: string
) => {
  if (numberFormat === NumberFormat.Custom) {
    return subformat ?? GENERAL_FORMAT;
  }
  switch (numberFormat) {
    case NumberFormat.Money:
      return '"' + (subformat ?? "$") + '"#,##0.00';
    case NumberFormat.Percentage:
      return "0%";
    case NumberFormat.Integer:
      return "0";
    case NumberFormat.Float:
      if (subformat) {
        const decimals = parseInt(subformat);
        if (!isNaN(decimals)) {
          return "0." + "0".repeat(decimals);
        }
      }
      return GENERAL_FORMAT;
    case NumberFormat.Date:
      return subformat ?? "m/d/yyyy";
    default:
      return GENERAL_FORMAT;
  }
};

export const formatNumber = (
  value: number,
  numberFormat?: NumberFormat,
  subformat?: string,
  forEdit?: boolean
) => {
  const customFormat = toCustomNumberFormat(numberFormat, subformat);
  return formatNumberToText(value, customFormat, forEdit) ?? "" + value;
};

export const changeNumberOfDecimals = (
  customExcelFormat: string,
  cellValue: string | number | null,
  increase: boolean
) => {
  if (customExcelFormat === GENERAL_FORMAT) {
    if (cellValue == null || typeof cellValue !== "number") {
      return GENERAL_FORMAT;
    }
    const currentPrecision = new Decimal(cellValue).dp();
    const newPrecision = increase ? currentPrecision + 1 : currentPrecision - 1;
    return "0." + "0".repeat(newPrecision);
  }
  const firstZero = customExcelFormat.indexOf("0");
  if (firstZero === -1) {
    return customExcelFormat;
  }
  const decimalSeparator = customExcelFormat.indexOf(".", firstZero);
  if (decimalSeparator === -1) {
    if (increase) {
      const lastZero = customExcelFormat.lastIndexOf("0");
      return (
        customExcelFormat.slice(0, lastZero + 1) +
        ".0" +
        customExcelFormat.slice(lastZero + 1)
      );
    } else {
      return customExcelFormat;
    }
  }
  if (increase) {
    return (
      customExcelFormat.slice(0, decimalSeparator + 1) +
      "0" +
      customExcelFormat.slice(decimalSeparator + 1)
    );
  }
  if (
    customExcelFormat.length > decimalSeparator + 2 &&
    customExcelFormat.slice(decimalSeparator + 1, decimalSeparator + 3) === "00"
  ) {
    return (
      customExcelFormat.slice(0, decimalSeparator + 1) +
      customExcelFormat.slice(decimalSeparator + 2)
    );
  }
  if (
    customExcelFormat.length > decimalSeparator + 1 &&
    customExcelFormat[decimalSeparator + 1] === "0"
  ) {
    return (
      customExcelFormat.slice(0, decimalSeparator - 1) +
      customExcelFormat.slice(decimalSeparator + 1)
    );
  }
  return customExcelFormat;
};

export function skipContiguousCells(
  dimension: Dimension,
  direction: 1 | -1,
  grid: GridElement[][],
  activeLocation: SheetLocation,
  visibleHeaders: number[]
): SheetSelection {
  const getCellLocation = (
    currentLocation: SheetLocation,
    activeAxis: "row" | "col",
    activePosition: number
  ): SheetLocation => ({
    row: activeAxis === "row" ? activePosition : currentLocation.row,
    col: activeAxis === "col" ? activePosition : currentLocation.col,
  });

  const [, activeAxis] = getDimensionNames(dimension);
  const edgeCoordinate =
    visibleHeaders[direction === 1 ? visibleHeaders.length - 1 : 0];
  const nextVisiblePosition =
    visibleHeaders.indexOf(activeLocation[activeAxis]) + direction;

  if (nextVisiblePosition < 0 || nextVisiblePosition >= visibleHeaders.length) {
    const nextLocation = getCellLocation(activeLocation, activeAxis, edgeCoordinate);
    return {
      start: nextLocation,
      end: nextLocation,
    };
  }

  const nextCellLocation = getCellLocation(
    activeLocation,
    activeAxis,
    visibleHeaders[nextVisiblePosition]
  );
  const isSearchingForLastFilledCell =
    !isEmpty(grid[activeLocation.row][activeLocation.col].expression) &&
    !isEmpty(grid[nextCellLocation.row][nextCellLocation.col].expression);

  let targetCoordinate: number | null = null;
  for (let i = nextVisiblePosition; i in visibleHeaders; i += direction) {
    const currentLocation = getCellLocation(
      activeLocation,
      activeAxis,
      visibleHeaders[i]
    );
    const currentCellExpression =
      grid[currentLocation.row][currentLocation.col].expression;
    if (isSearchingForLastFilledCell === isEmpty(currentCellExpression)) {
      const searchCoordinate =
        visibleHeaders[isSearchingForLastFilledCell ? i - direction : i];
      if (!isNil(visibleHeaders)) targetCoordinate = searchCoordinate;
      break;
    }
  }

  const targetCellLocation = getCellLocation(
    activeLocation,
    activeAxis,
    targetCoordinate ?? edgeCoordinate
  );

  return {
    start: targetCellLocation,
    end: targetCellLocation,
  };
}

export const getAdjustedCutSelection = (
  cutState: CutState,
  contents: InsertDeleteContent
): SheetSelection => {
  const { selection } = cutState;
  const { dimension, sheetTransform, selectedIndex, amount = 0 } = contents;
  const delta = sheetTransform === SheetTransform.Delete ? -amount : amount;
  if (selection.end[dimension] > selectedIndex) {
    const updatedSelection = { ...selection };
    updatedSelection.end[dimension] += delta;
    if (selection.start[dimension] > selectedIndex) {
      updatedSelection.start[dimension] += delta;
    }
    return updatedSelection;
  }
  return selection;
};

export const isFormulaValue = (value: string): boolean => value.startsWith("=");
