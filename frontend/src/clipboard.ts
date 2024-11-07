import { CellObject, read, utils, WorkSheet } from "xlsx";
import css from "@adobe/css-tools";
import { range } from "./react-datasheet/src/DataSheet";

import {
  CellAttributes,
  GridElement,
  SheetLocation,
  isFormulaValue,
  SheetSelection,
  toA1,
} from "./SheetUtils";

import { getCellOriginalValue, isNumberValue, renderValue } from "./RenderTools";
import {
  BorderType,
  CellAttribute,
  LineWrapDefault,
  TextAlign,
  TextAlignDefault,
  TextAlignNumber,
  TextStyle,
  VerticalAlign,
  VerticalAlignDefault,
} from "./NeptyneProtocol";
import trim from "lodash/trim";
import escape from "lodash/escape";
import isEmpty from "lodash/isEmpty";
import { getAttributesWithUpdatedNumberFormat } from "./neptyne-sheet/sheet-hooks";

export interface StylesFromCell {
  textAlign: TextAlign;
  fontWeight: "bold" | "normal";
  fontStyle: "italic" | "normal";
  verticalAlign: VerticalAlign;
}

type Style = Record<string, string>;
export type StylesMap = Record<string, Style>;

// https://developer.mozilla.org/ru/docs/Web/API/Node/nodeType
enum NodeType {
  Element = 1,
  Text = 3,
}

const DEFAULT_GRID_ELEMENT: Omit<GridElement, "value"> = {
  expression: "",
};

const NEPTYNE_ATTRIBUTES_KEY = "data-neptyne-attributes";

const NEPTYNE_CELL_ATTRIBUTE_KEY = "data-neptyne-clipboard";

const NEPTYNE_CELL_ATTRIBUTE = `${NEPTYNE_CELL_ATTRIBUTE_KEY}="cell"`;

const NEPTYNE_CUT_ID_ATTRIBUTE_KEY = "data-neptyne-cut-id";

/**
 * Parses GridElement object and returns keys that could be used for CSS.
 */
export const cellToStyleParams = (cell: GridElement): StylesFromCell => {
  const textStyle = cell.attributes?.[CellAttribute.TextStyle] || "";
  const parsedTextStyle = textStyle.split(" ");
  const fontWeight = parsedTextStyle.includes(TextStyle.Bold) ? "bold" : "normal";
  const fontStyle = parsedTextStyle.includes(TextStyle.Italic) ? "italic" : "normal";
  const verticalAlign =
    (cell.attributes?.[CellAttribute.VerticalAlign] as VerticalAlign) ||
    VerticalAlignDefault;

  const textAlign =
    (cell.attributes?.[CellAttribute.TextAlign] as TextAlign) ||
    (isNumberValue(cell.value) && TextAlignNumber) ||
    TextAlignDefault;

  return { fontWeight, fontStyle, textAlign, verticalAlign };
};

/**
 * Returns plain-text representation of selected grid cells. If cell has expression - use
 * expression. If not - use value.
 */
export const getPlainTextClipboard = (
  grid: GridElement[][],
  { start, end }: SheetSelection
) =>
  range(start.row, end.row)
    .map((i) =>
      range(start.col, end.col)
        .map((j) => renderValue(grid[i][j]))
        .join("\t")
    )
    .join("\n");

/**
 * When only single cell is selected, Google Sheets use special encoded formats of styles.
 *
 * This function takes Neptyne cell and returns a string with encoded styles that Google Sheets
 * would understand.
 */
const getUserFormatAttribute = (cell: GridElement) => {
  const { fontWeight, fontStyle, textAlign } = cellToStyleParams(cell);
  const formats = [];

  if (fontWeight === "bold") {
    formats.push('"17":1');
  }
  if (fontStyle === "italic") {
    formats.push('"18":1');
  }
  if (textAlign === TextAlign.Left) {
    formats.push('"9":0');
  }
  if (textAlign === TextAlign.Center) {
    formats.push('"9":1');
  }
  if (textAlign === TextAlign.Right) {
    formats.push('"9":2');
  }

  return `data-sheets-userformat='{"2":53440,"10":2,"15":"Arial",${formats.join(
    ","
  )}}'`;
};

/**
 * Returns html clipboard data, when single cell is selected.
 */
const getSingleValueHtml = (cell: GridElement, cutId: string | undefined) => `
    <style type="text/css">
      <!--td {border: 1px solid #ccc;}br {mso-data-placement:same-cell;}--></style>
      ${getHtmlCell(cell, true, cutId)}
    `;

/**
 * Returns html clipboard data, when multiple cells is selected.
 */
const getMultipleValueHtml = (
  grid: GridElement[][],
  { start, end }: SheetSelection,
  cutId: string | undefined
) => {
  const content = range(start.row, end.row)
    .map((i) => {
      const rowContent = range(start.col, end.col)
        .map((j) => getHtmlCell(grid[i][j], false))
        .join("");
      return `<tr style="height: 21px">${rowContent}</tr>`;
    })
    .join("");
  return `
    <google-sheets-html-origin ${
      cutId ? `${NEPTYNE_CUT_ID_ATTRIBUTE_KEY}="${escape(cutId)}"` : ""
    }
    ><style type="text/css">
      <!--td {border: 1px solid #ccc;}br {mso-data-placement:same-cell;}-->
    </style>
    <table
      xmlns="http://www.w3.org/1999/xhtml"
      cellspacing="0"
      cellpadding="0"
      dir="ltr"
      border="1"
      style="
        table-layout: fixed;
        font-size: 10pt;
        font-family: Arial;
        width: 0px;
        border-collapse: collapse;
        border: none;
      "
    >
      <colgroup>
        <col width="100" />
        <col width="100" />
      </colgroup>
      <tbody>${content}</tbody>
    </table>
  </google-sheets-html-origin>
  `;
};

/**
 * Returns CSS rules for html clipboard, when multiple cells are selected.
 */
const getHtmlCellStyles = (cell: GridElement) => {
  const { textAlign, fontWeight, fontStyle, verticalAlign } = cellToStyleParams(cell);

  return `vertical-align: ${verticalAlign};
  text-align: ${textAlign};
  font-weight: ${fontWeight};
  font-style: ${fontStyle};`;
};

const getHtmlNeptyneAttributes = (cell: GridElement) => {
  if (isEmpty(cell.attributes)) return "";
  const value = escape(JSON.stringify(cell.attributes)).replace(/ /g, "&#32;");

  return `${NEPTYNE_ATTRIBUTES_KEY}=${value}`;
};

/**
 * Returns html representation of single cell when multiple cells are selected.
 */
export const getHtmlCell = (
  cell: GridElement,
  isSingleCell: boolean,
  cutId?: string
) => {
  const { expression, value } = cell;
  const formulaAttribute = getFormulaAttribute(expression);
  const userFormatAttribute = getUserFormatAttribute(cell);
  const dataSheetsValueAttribute = getDataSheetsValueAttribute(value);
  const htmlCellStyles = getHtmlCellStyles(cell);
  const cellAttributes = getHtmlNeptyneAttributes(cell);
  const tagName = isSingleCell ? "span" : "td";

  return `<${tagName}
    ${cutId ? `${NEPTYNE_CUT_ID_ATTRIBUTE_KEY}="${escape(cutId)}"` : ""}
    ${NEPTYNE_CELL_ATTRIBUTE}
    style="${htmlCellStyles}"
    ${dataSheetsValueAttribute}
    ${formulaAttribute}
    ${cellAttributes}
    ${userFormatAttribute}
  >${escape(value?.toString() || "")}</${tagName}>`;
};

/**
 * Returns a special HTML attribute that Google Sheets uses to store formula.
 */
export const getFormulaAttribute = (formula: string | null) =>
  formula && isFormulaValue(formula) ? `data-sheets-formula="${escape(formula)}"` : "";

/**
 * Returns special HTML attribute that Google Sheets uses to store data format.
 */
export const getDataSheetsValueAttribute = (value: string | number | null) => {
  if (isNumberValue(value)) {
    return `data-sheets-value='{"1":3,"3":${value}}'`;
  }
  return `data-sheets-value='{"1":2,"2":"${escape(value as string)}"}'`;
};

export const getHtmlClipboard = (
  grid: GridElement[][],
  selection: SheetSelection,
  cutId: string | undefined
): string => {
  const { start, end } = selection;
  if (start.row === end.row && start.col === end.col) {
    const cell = grid[start.row][start.col];
    return getSingleValueHtml(cell, cutId);
  }
  return getMultipleValueHtml(grid, selection, cutId);
};

export const copyToClipboard = (
  e: ClipboardEvent,
  grid: GridElement[][],
  selection: SheetSelection,
  cutId?: string
): void => {
  e.preventDefault();

  const text = getPlainTextClipboard(grid, selection);
  const html = getHtmlClipboard(grid, selection, cutId);
  if (e.clipboardData && e.clipboardData.setData) {
    // e.clipboardData.setData will work for native events
    e.clipboardData.setData("text/plain", text);
    e.clipboardData.setData("text/html", html);
  } else {
    const richTextInput = new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([text], { type: "text/plain" }),
    });
    navigator.clipboard.write([richTextInput]);
  }
};

export const tsvTextClipboardToNeptyneCells = (str: string): GridElement[][] => {
  if (str === "") return [];
  const plainTextPasteParse = (str: string): string[][] => {
    return str.split(/\r\n|\n|\r/).map((row: string) => row.split("\t"));
  };
  return plainTextPasteParse(str).map((row) =>
    row.map((cell) => ({ ...DEFAULT_GRID_ELEMENT, value: cell, expression: cell }))
  );
};

const getRootTableTag = (element: Element): Element | undefined =>
  element.tagName === "TABLE"
    ? element
    : Array.from(element.children)
        .map((child) => getRootTableTag(child))
        .find(Boolean);

export const htmlClipboardToNeptyneCells = (
  htmlClipboard: HTMLElement,
  activeCellCoordinates: SheetLocation
): GridElement[][] => {
  // single-value google sheets clipboard
  const singleGoogleCellTag = Array.from(htmlClipboard.children).find(
    (child) =>
      child.tagName === "SPAN" && child.attributes.getNamedItem("data-sheets-value")
  );
  if (singleGoogleCellTag) {
    return [
      [htmlToGridElement(singleGoogleCellTag as HTMLElement, activeCellCoordinates)],
    ];
  }

  const rootTableTag = getRootTableTag(htmlClipboard);

  if (rootTableTag) {
    const tbody = Array.from(rootTableTag.children).find(
      (child) => child.tagName === "TBODY"
    );
    if (!tbody) {
      return [];
    }

    const colspan = Array.from(tbody.children).reduce(
      (maxColspan, row) =>
        Math.max(
          maxColspan,
          (Array.from(row.children) as HTMLTableCellElement[]).reduce(
            (colspan, cell) => colspan + cell.colSpan || 0,
            0
          )
        ),
      0
    );

    const normalizedCells = getNormalizedClipboardCells(
      tbody as HTMLTableElement,
      colspan
    );

    return Array.from(normalizedCells).map((row, rowIdx) =>
      Array.from(row).map((cell, colIdx) =>
        htmlToGridElement(cell, {
          row: activeCellCoordinates.row + rowIdx,
          col: activeCellCoordinates.col + colIdx,
        })
      )
    );
  }

  // For now I added support for only p-tags from outer sources. This will convert the majority of
  // cases and I am not really sure how to prediclably parse other random tags we could encounter
  return Array.from(htmlClipboard.children)
    .filter((child) => child.tagName === "P")
    .map((p, idx) => [
      htmlToGridElement(p as HTMLElement, {
        ...activeCellCoordinates,
        row: activeCellCoordinates.row + idx,
      }),
    ]);
};

const htmlToGridElement = (
  _element: HTMLElement | null,
  activeCellCoordinates: SheetLocation
): GridElement => {
  if (!_element) {
    return { ...DEFAULT_GRID_ELEMENT, value: "" };
  }
  const [element, attributes] = unnestElement(_element, {});
  return {
    ...DEFAULT_GRID_ELEMENT,
    expression: getCellExpression(element, activeCellCoordinates),
    attributes: { ...htmlToCellAttributes(element), ...attributes },
    value: trim(element.innerText ?? element.innerHTML, "\n\t "),
  };
};

const getCellExpression = (
  element: HTMLElement,
  activeCellCoordinates: SheetLocation
): string | null => {
  const googleSheetsExpression = element.getAttribute("data-sheets-formula");
  if (googleSheetsExpression) {
    return getParsedR1C1Expression(googleSheetsExpression, activeCellCoordinates);
  }
  return trim(element.innerText ?? element.innerHTML, "\n\t ");
};

/**
 * Googe Sheets stores cell references in a special R1C1 format. Here we parse it and replace with
 * Neptyne cell references.
 */
export const getParsedR1C1Expression = (
  rawExpression: string,
  activeCellCoordinates: SheetLocation
): string => {
  try {
    // check that string generally matches the format. Keep in mind that numbers may come with
    // or without square brackets. Square brackets mean relative coordinates, while no brackets
    // mean absolute coordinates - the ones declared with $-syntax.
    return rawExpression.replace(/(R\[?-?\d+\]?)(C\[?-?\d+\]?)/g, (match) => {
      const [y, isYAbsolute] = expressionToCoords(
        match,
        "R",
        activeCellCoordinates.row
      );
      const [x, isxAbsolute] = expressionToCoords(
        match,
        "C",
        activeCellCoordinates.col
      );
      if (x >= 0 && y >= 0) {
        return toA1(x, y, isxAbsolute, isYAbsolute);
      }
      throw new Error("Invalid coords");
    });
  } catch (e) {
    return "=REF_ERROR";
  }
};

const expressionToCoords = (
  expression: string,
  dimension: string,
  offset: number
): [coord: number, isAbsolute: boolean] => {
  const coordStart = expression.indexOf(dimension);

  if (coordStart < 0) throw new Error(`Bad coordinate ${expression}`);

  const isAbsolute = expression[coordStart + 1] !== "[";
  const rawCoord = expression.substring(coordStart).match(/-?\d+/g)?.[0];

  if (!rawCoord) throw new Error(`Bad coordinate ${expression}`);

  const coord = parseInt(rawCoord) + (isAbsolute ? -1 : offset);

  return [coord, isAbsolute];
};

/**
 * Sometimes clipboard contains such values as <p><b>1</b></p> or <p>foo<b>1</b></p>. We need
 * to evaluate it contents and check if certain style is applied to entire DOM element.
 *
 * If element has one child and it is DOM node - we return its
 */
const unnestElement = (
  element: HTMLElement,
  attributes: CellAttributes
): [element: HTMLElement, attributes: CellAttributes] => {
  if (element.tagName === "TD") {
    const { rowSpan, colSpan, style } = element as HTMLTableCellElement;
    if (rowSpan > 1) {
      attributes[CellAttribute.RowSpan] = rowSpan.toString();
    }
    if (colSpan > 1) {
      attributes[CellAttribute.ColSpan] = colSpan.toString();
    }
    if (style.backgroundColor) {
      attributes[CellAttribute.BgColor] = style.backgroundColor;
    }
    if (style.color) {
      attributes[CellAttribute.Color] = style.color;
    }
    if (style.fontSize) {
      attributes[CellAttribute.FontSize] = parseInt(style.fontSize).toString();
    }
  }

  // Do not process neptyne clipboard
  if (element.getAttribute(NEPTYNE_CELL_ATTRIBUTE_KEY) === "cell")
    return [element, attributes];

  // if element has multiple children - we cannot determine nested styles and just return content
  // as is.
  if (element.childNodes.length !== 1) {
    let tmp = document.createElement("div");
    tmp.innerHTML = element.innerText;
    return [tmp, attributes];
  }

  // If element has one child and it is DOM node - we return its
  if (element.childNodes[0].nodeType === NodeType.Element) {
    const nestedElement = element.childNodes[0] as HTMLElement;
    return unnestElement(withStylesFromTagName(nestedElement), attributes);
  }

  // If element has one child and it is text - we return it as is.
  if (element.childNodes[0].nodeType === NodeType.Text) {
    return [withStylesFromTagName(element), attributes];
  }

  // Generally we should not reach this return, but it will simply return node without any
  // preprocessing.
  return [element, attributes];
};

/**
 * Styles implied by tag names are not registered in DOM object styles. I add them here manually
 * for more comfortable attribute parsing.
 *
 * Probably we could clone element instead of mutating it, but it might be expensive.
 */
const withStylesFromTagName = (element: HTMLElement): HTMLElement => {
  if (element.tagName === "B") {
    element.style.fontWeight = "bold";
  }
  if (element.tagName === "I") {
    element.style.fontStyle = "italic";
  }
  return element;
};

/**
 * Evaluates HTML element style attribute to find styles applicable to neptyne cells.
 */
const htmlToCellAttributes = (element: HTMLElement): CellAttributes => {
  const attributes: CellAttributes = {};
  if (element.hasAttribute(NEPTYNE_ATTRIBUTES_KEY))
    try {
      return JSON.parse(element.getAttribute(NEPTYNE_ATTRIBUTES_KEY)!);
    } catch (error) {
      console.error("Unable to parse Neptyne attributes on cell! ", error);
    }

  let textStyle = [];
  if (element.style.fontWeight === "bold") {
    textStyle.push(TextStyle.Bold);
  }
  if (element.style.fontStyle === "italic") {
    textStyle.push(TextStyle.Italic);
  }

  if (textStyle.length) {
    attributes[CellAttribute.TextStyle] = textStyle.join(" ");
  }

  if (element.style.textAlign) {
    attributes[CellAttribute.TextAlign] = element.style.textAlign;
  }

  if (element.style.verticalAlign) {
    attributes[CellAttribute.VerticalAlign] = element.style.verticalAlign;
  }

  // @ts-ignore
  if (element.rowSpan > 1) {
    // @ts-ignore
    attributes[CellAttribute.RowSpan] = element.rowSpan.toString();
  }
  if (
    // @ts-ignore
    element.colSpan > 1
  ) {
    // @ts-ignore
    attributes[CellAttribute.ColSpan] = element.colSpan.toString();
  }

  return attributes;
};

/**
 * Turns string from clipboard to true DOM elements.
 */
const getClipboardDomElement = (rawHtml: string): HTMLElement => {
  const htmlObject = document.createElement("div");
  htmlObject.innerHTML = rawHtml;
  return htmlObject;
};

export const getCutId = (event: ClipboardEvent): string | null => {
  return (
    (event.clipboardData &&
      getClipboardDomElement(event.clipboardData.getData("text/html"))
        .querySelector(`[${NEPTYNE_CUT_ID_ATTRIBUTE_KEY}]`)
        ?.getAttribute(NEPTYNE_CUT_ID_ATTRIBUTE_KEY)) ??
    null
  );
};

export const getParsedHtmlClipboard = (
  htmlClipboard: string,
  activeCellCoordinates: SheetLocation
): GridElement[][] => {
  const parsedClipboardDomElement = getClipboardDomElement(htmlClipboard);
  if (isExcelClipboard(parsedClipboardDomElement)) {
    cleanBitmaps(parsedClipboardDomElement);
    const workbook = read(parsedClipboardDomElement.outerHTML, {
      type: "string",
      cellStyles: true,
      cellNF: true,
      cellHTML: true,
      raw: true,
    });
    return excelClipboardToNeptyneCells(
      parsedClipboardDomElement,
      workbook.Sheets["Sheet1"]
    );
  }
  return htmlClipboardToNeptyneCells(parsedClipboardDomElement, activeCellCoordinates);
};

/**
 * We rely on XLSX library for parsing values, and parsing fails as long as spreadsheet has
 * special graphic objects.
 */
const cleanBitmaps = (clipboard: HTMLElement) => {
  const children = Array.from(clipboard.children) as HTMLElement[];
  children.forEach((child) => {
    if (
      child
        .getAttribute("style")
        ?.split(";")
        .some((rawStyle) => rawStyle.includes("mso-ignore:vglayout"))
    ) {
      clipboard.removeChild(child);
    } else {
      cleanBitmaps(child);
    }
  });
};

const isExcelClipboard = (element: HTMLElement) =>
  Array.from(element.children).some(
    // @ts-ignore
    (node: HTMLMetaElement) => node.content === "Excel.Sheet"
  );

const excelClipboardToNeptyneCells = (
  element: HTMLElement,
  sheet: WorkSheet
): GridElement[][] => {
  const stylesMap = getExcelStyleMap(element);
  const { tbody, colspan } = getExcelTable(element);
  if (!tbody) {
    return [];
  }

  const normalizedClipboardCells = getNormalizedClipboardCells(tbody, colspan);

  const result: GridElement[][] = [];
  for (let i = 0; i < normalizedClipboardCells.length; i++) {
    const row = normalizedClipboardCells[i];
    result.push(Array(row.length).fill({ value: null }));
    for (let j = 0; j < row.length; j++) {
      result[i][j] = excelClipboardToCell(
        // the only reason we use sheet and xlsx library is parsing text - it handles line breaks
        // really well. We might want to find a simpler way.
        sheet[utils.encode_cell({ r: i, c: j })],
        normalizedClipboardCells[i][j],
        stylesMap
      );
    }
  }
  return result;
};

export const excelClipboardToCell = (
  cell: CellObject | undefined,
  clipboardCell: HTMLTableCellElement | null,
  stylesMap: StylesMap
): GridElement => {
  if (!clipboardCell) {
    return { value: null } as GridElement;
  }
  const rawValue = cell?.v?.toString() || "";
  const styles = stylesMap[`.${clipboardCell.className}`];

  const isNumber = !!styles?.["mso-number-format"];

  // money uses comma as decimal places separator, and integers use comma as thousands delimiter
  const clearedRawValue = isNumber
    ? rawValue.includes("$")
      ? rawValue.replace(/,| /g, "")
      : rawValue.replace(/,/g, ".")
    : rawValue;

  const value = getCellOriginalValue(clearedRawValue);
  let attributes: CellAttributes = {
    ...getAttributesWithUpdatedNumberFormat(clearedRawValue, {}),
    [CellAttribute.LineWrap]: LineWrapDefault,
  };

  if (styles) {
    const textStyle: TextStyle[] = [];
    const borders: BorderType[] = [];
    if (styles["font-weight"] === "700") {
      textStyle.push(TextStyle.Bold);
    }
    if (styles["background"]) {
      attributes[CellAttribute.BgColor] = styles["background"];
    }
    if (styles["color"]) {
      attributes[CellAttribute.Color] = styles["color"];
    }
    if (styles["font-size"]) {
      // this is be too naive, but I think it might be too early for complex checks and
      // extractions

      // TODO: autosize columns if needed after paste
      attributes[CellAttribute.FontSize] = parseInt(styles["font-size"]).toString();
    }
    if (styles["font-style"] === "italic") {
      textStyle.push(TextStyle.Italic);
    }
    if (styles["border-top"] && styles["border-top"] !== "none") {
      borders.push(BorderType.BorderTop);
    }
    if (styles["border-bottom"] && styles["border-bottom"] !== "none") {
      borders.push(BorderType.BorderBottom);
    }
    if (styles["border-left"] && styles["border-left"] !== "none") {
      borders.push(BorderType.BorderLeft);
    }
    if (styles["border-right"] && styles["border-right"] !== "none") {
      borders.push(BorderType.BorderRight);
    }
    if (styles["text-align"]) {
      attributes[CellAttribute.TextAlign] = styles["text-align"];
    }
    if (borders.length) {
      attributes[CellAttribute.Border] = borders.join(" ");
    }
    if (textStyle.length) {
      attributes[CellAttribute.TextStyle] = textStyle.join(" ");
    }
  }
  if (clipboardCell.rowSpan > 1) {
    attributes[CellAttribute.RowSpan] = clipboardCell.rowSpan.toString();
  }
  if (
    clipboardCell.colSpan > 1 &&
    clipboardCell
      .getAttribute("style")
      ?.split(";")
      // https://stigmortenmyre.no/mso/html/excel/xlcontables.htm
      // mso-ignore means that colspan is used for cell overflow, not for merge
      .every((rawStyle) => !rawStyle.includes("mso-ignore"))
  ) {
    attributes[CellAttribute.ColSpan] = clipboardCell.colSpan.toString();
  }
  return {
    value: value,
    expression: value,
    attributes,
  };
};

const getExcelStyleMap = (clipboardElement: HTMLElement): StylesMap => {
  const styleElement = Array.from(clipboardElement.children).find(
    (child) => child.tagName === "STYLE"
  );
  if (!styleElement) {
    return {};
  }
  const rawStyles = (styleElement as HTMLStyleElement).innerText;
  const styles = css.parse(rawStyles.replaceAll(/\n/g, "").replaceAll(/\t/g, ""), {
    silent: true,
  });
  return (styles.stylesheet.rules as any[]).reduce((acc, style) => {
    if (style.type === "rule" && style.selectors.length === 1) {
      acc[style.selectors[0]] = (style.declarations as any[]).reduce(
        (acc, style) => ({ ...acc, [style.property]: style.value }),
        {}
      );
    }
    return acc;
  }, {});
};

const getExcelTable = (
  clipboardElement: HTMLElement
): { tbody: HTMLTableElement | undefined; colspan: number } => {
  const table = Array.from(clipboardElement.children).find(
    (el) => el.tagName === "TABLE"
  );
  const tbody = table
    ? (Array.from(table.children).find(
        (el) => el.tagName === "TBODY"
      ) as HTMLTableElement)
    : undefined;
  if (!tbody) {
    return { tbody, colspan: 0 };
  }
  return {
    tbody,
    colspan: (Array.from(table!.children[0].children) as HTMLTableColElement[]).reduce(
      (acc, col) => acc + (col.span || 1),
      0
    ),
  };
};

/**
 * In the end, we need to get a two-dimensional array of cells, with same number of cells
 * in each row.
 *
 * However, clipboard skips cells that have been merged and overflown. So here we account for this
 * and insert null elements in proper positions, which results in more straightforward cell
 * management.
 *
 * @param colspan - number of columns in a row. Suppose we copy cells A1 and B1, where B1 is merged
 * in A1 or overflown by A1. In this case we will have a single td element in a row, but colspan
 * will help us figure out the actual size of copied selection.
 */
const getNormalizedClipboardCells = (
  tbody: HTMLTableElement,
  colspan: number
): (HTMLTableCellElement | null)[][] => {
  const rows = Array.from(tbody.children);
  const normalizedClipboardCells: (HTMLTableCellElement | null)[][] = Array.from(
    { length: rows.length },
    () => Array(colspan)
  );

  for (let i = 0; i < rows.length; i++) {
    const cols = Array.from(rows[i].children) as HTMLTableCellElement[];

    // we only increase this counter if we passed merged/overflown cell area, and need to access
    // the next column in a clipboard
    let clipboardColCount = 0;

    for (let j = 0; j < colspan; j++) {
      // explicit null equality means this cell is already overflown or merged, and
      // we need to skip it
      if (normalizedClipboardCells[i][j] === null) {
        continue;
      }

      const td = cols[clipboardColCount];
      clipboardColCount++;

      // this can happen because uf different number of cells in different rows
      if (!td) {
        continue;
      }
      normalizedClipboardCells[i][j] = td;

      // handle cells from next rows merged into the current one
      if (td.rowSpan > 1) {
        let colSpan = td.colSpan || 1;
        while (colSpan > 0) {
          let rowSpan = td.rowSpan;
          while (rowSpan > 1) {
            if (normalizedClipboardCells[i + rowSpan - 1]) {
              normalizedClipboardCells[i + rowSpan - 1][j + colSpan - 1] = null;
            }
            rowSpan--;
          }
          colSpan--;
        }
      }

      // handle cells overflown with the current cell, as well as horizontal merge
      if (td.colSpan > 1) {
        j += td.colSpan - 1;
      }
    }
  }
  return normalizedClipboardCells;
};

export const tryPasteImage = (
  e: ClipboardEvent,
  found: (mimeType: string, data: string) => void
) => {
  const items = e.clipboardData?.items;
  if (!items) {
    return;
  }
  for (let item of items) {
    if (item.kind === "file") {
      const blob = item.getAsFile();
      if (!blob) {
        continue;
      }

      const reader = new FileReader();

      reader.onload = (e) => {
        const data = e.target?.result;
        if (!data) {
          return;
        }
        const bits = data.toString().split(",");
        const mimeType = bits[0].split(":")[1].split(";")[0];
        if (
          mimeType === "image/png" ||
          mimeType === "image/jpeg" ||
          mimeType === "image/gif"
        ) {
          found(mimeType, bits[1]);
        }
      };
      reader.readAsDataURL(blob);
      return;
    }
  }
};

export const fillSelectionWithClipboard = (
  parsedClipboard: GridElement[][],
  selection: SheetSelection
) => {
  const selectionCounts = {
    row: selection.end.row - selection.start.row + 1,
    col: selection.end.col - selection.start.col + 1,
  };

  let filledSelection = parsedClipboard.map((row, index) => {
    const sourceRow = parsedClipboard[index];
    while (selectionCounts.col >= row.length + sourceRow.length)
      row = row.concat(sourceRow);
    return row;
  });

  while (selectionCounts.row >= filledSelection.length + parsedClipboard.length)
    filledSelection = filledSelection.concat(
      filledSelection.slice(0, parsedClipboard.length)
    );

  return filledSelection;
};

export const getParsedClipboard = (
  e: ClipboardEvent,
  sheetSelection: SheetSelection
): GridElement[][] => {
  if (!e.clipboardData || !e.clipboardData.getData) {
    return [];
  }

  const activeCellCoordinates = sheetSelection.start;

  const parsedClipboard = getParsedHtmlClipboard(
    e.clipboardData.getData("text/html"),
    activeCellCoordinates
  );
  if (parsedClipboard.length) {
    return parsedClipboard;
  }

  return tsvTextClipboardToNeptyneCells(e.clipboardData.getData("text/plain"));
};

export const callWithNavigatorClipboard = (callback: (e: ClipboardEvent) => void) => {
  window.navigator.clipboard.read().then((clipboardItems) => {
    const plainTextClipboardPromise =
      clipboardItems
        .find((item) => item.types.includes("text/plain"))
        ?.getType("text/plain")
        .then((blob) => blob.text()) || Promise.resolve("");
    const richTextClipboardPromise =
      clipboardItems
        .find((item) => item.types.includes("text/html"))
        ?.getType("text/html")
        .then((blob) => blob.text()) || Promise.resolve("");
    Promise.all([plainTextClipboardPromise, richTextClipboardPromise]).then(
      ([plainTextClipboard, richTextClipboard]) => {
        const mockClipboardEvent = {
          clipboardData: {
            getData: (type: string) => {
              if (type === "text/plain") {
                return plainTextClipboard;
              }
              if (type === "text/html") {
                return richTextClipboard;
              }
              return "";
            },
          },
        } as ClipboardEvent;
        callback(mockClipboardEvent);
      }
    );
  });
};
