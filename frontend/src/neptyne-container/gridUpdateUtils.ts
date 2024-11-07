import _, { range } from "lodash";
import without from "lodash/without";
import {
  ALLOWED_FONTS,
  CellAttributes,
  GridElement,
  parseCellId,
  ParsedSheetCell,
  resizeGrid,
  SheetLocation,
  SheetSelection,
  SheetUnawareCellAttributeUpdate,
  toA1,
} from "../SheetUtils";
import {
  FullSheetCell,
  NeptyneContainerState,
  RemoteSheetCell,
  Sheet,
  SheetAttributes,
} from "./NeptyneContainer";
import {
  BorderType,
  CellAttribute,
  CellAttributeUpdate,
  CellChange,
  LineWrap,
  LineWrapDefault,
  SheetCellId,
} from "../NeptyneProtocol";
import {
  getCellFormattedValue,
  getTextPreview,
  outputToData,
  renderDisplayData,
} from "../RenderTools";
import { CellChangeWithRowCol } from "../neptyne-sheet/NeptyneSheet";
import { DEFAULT_FONT_SIZE } from "../components/ToolbarControls/FontSizeSelect";
import {
  getColSizes,
  NumberDict,
  getHiddenColHeaders,
} from "../neptyne-sheet/GridView";

function fitLocationIntoGrid(
  cell: SheetLocation,
  rows: number,
  cols: number
): SheetLocation {
  if (!cell) return cell;

  return {
    row: Math.max(0, Math.min(cell.row, rows - 1)),
    col: Math.max(0, Math.min(cell.col, cols - 1)),
  };
}
function fitSelectionIntoGrid(
  selection: SheetSelection | null,
  rows: number,
  cols: number
): SheetSelection | null {
  if (!selection) return selection;
  return {
    start: fitLocationIntoGrid(selection.start, rows, cols),
    end: fitLocationIntoGrid(selection.end, rows, cols),
  };
}

export function processGridResize(
  state: NeptyneContainerState,
  sheetId: number,
  cols: number,
  rows: number
) {
  if (sheetId === state.currentSheet) {
    const {
      grid: prevGrid,
      sheetSelection: prevSheetSelection,
      activeSheetCellId: prevActiveSheetCellId,
      copySelection: prevCopySelection,
    } = state;
    const grid = resizeGrid(prevGrid, cols, rows);
    const payload = { ...state, grid };

    if (prevGrid.length > rows || prevGrid[0].length > cols) {
      const sheetSelection = fitSelectionIntoGrid(prevSheetSelection, rows, cols);
      const [activeSheetCellId, copySelection] = [
        prevActiveSheetCellId,
        prevCopySelection,
      ].map((location) => location && fitLocationIntoGrid(location, rows, cols));
      Object.assign(payload, { sheetSelection, activeSheetCellId, copySelection });
    }

    return payload;
  } else {
    for (let sheet of state.sheets) {
      if (sheet.id === sheetId) {
        sheet.nRows = rows;
        sheet.nCols = cols;
      }
    }
    return state;
  }
}

export const getCellId = (cell: RemoteSheetCell): SheetCellId => {
  if (Array.isArray(cell)) {
    return cell[0];
  }
  return cell.cellId;
};

function updateSheets(sheets: Sheet[], cellUpdates: RemoteSheetCell[]) {
  const newSheets = [...sheets];
  for (const cell of cellUpdates) {
    const parsed = parseCellId(getCellId(cell));
    if (!parsed.notebookCell) {
      const { x, y, sheetId } = parsed;
      const sheet = sheets.find((sheet) => sheet.id === sheetId);
      if (sheet === undefined) {
        console.error("Cell update arrived for sheet that doesn't exist", sheetId);
        continue;
      }
      const cells = sheet.cells;
      if (cells[x] === undefined) {
        cells[x] = [];
      }
      cells[x][y] = cell;
    }
  }
  return newSheets;
}

const reflateCell = (cell: RemoteSheetCell): FullSheetCell => {
  if (!Array.isArray(cell)) {
    return cell;
  }
  const value = cell[1] !== null ? cell[1] : "";
  if (cell.length === 2) {
    return {
      cellId: cell[0],
      code: "" + value,
      outputs: value,
    };
  }
  return {
    cellId: cell[0],
    code: cell[2] || "",
    outputs: value,
  };
};

interface FilteredRemoteSheetCell {
  cell: FullSheetCell;
  row: number;
  col: number;
}

export function updateGrid(
  grid: GridElement[][],
  cellUpdates: RemoteSheetCell[],
  sheetAttributes: SheetAttributes,
  fullUpdate?: boolean
) {
  const nextGrid = [...grid];

  // filtering out updates unrelated to the grid
  const validCellUpdates = cellUpdates
    .map((remoteSheetCell) => {
      if (remoteSheetCell === undefined) {
        return null;
      }
      const cell = reflateCell(remoteSheetCell);
      const parsed = parseCellId(cell.cellId);
      if (parsed.notebookCell) {
        return null;
      }
      const { y: row, x: col } = parsed;
      if (
        row >= 0 &&
        row < nextGrid.length &&
        col! >= 0 &&
        col! < nextGrid[row].length
      ) {
        return { cell, row, col };
      }
      return null;
    })
    .filter((remoteSheetCell) => !!remoteSheetCell) as FilteredRemoteSheetCell[];

  const rootMergedCells: { cell: GridElement; row: number; col: number }[] = [];
  const bordersToMoveMap: Record<string, BorderType[]> = {};

  for (const remoteSheetCell of validCellUpdates) {
    const { cell, row, col } = remoteSheetCell;
    const { viewer, value, addedCellAttributes, addedCellFields } = renderDisplayData(
      outputToData(cell.outputs)
    );
    const attributes = { ...cell.attributes, ...addedCellAttributes };

    let rowSpan = attributes[CellAttribute.RowSpan]
      ? parseInt(attributes[CellAttribute.RowSpan])
      : undefined;
    let colSpan = attributes[CellAttribute.ColSpan]
      ? parseInt(attributes[CellAttribute.ColSpan])
      : undefined;

    if (rowSpan && rowSpan > 1 && !colSpan) {
      colSpan = 1;
    }
    if (colSpan && colSpan > 1 && !rowSpan) {
      rowSpan = 1;
    }

    const gridCell: GridElement = {
      value,
      expression: cell.code,
      ...addedCellFields,
      attributes,
      rowSpan,
      colSpan,
      overflowColSpan: grid[row][col].overflowColSpan,
    };

    if (!!rowSpan && !!colSpan) {
      rootMergedCells.push({ row, col, cell: gridCell });
    }

    if (!_.isEmpty(cell.attributes) || !_.isEmpty(addedCellAttributes)) {
      gridCell.attributes = { ...cell.attributes, ...addedCellAttributes };
    }

    moveBorders(
      gridCell.attributes,
      row,
      rowSpan || 1,
      col,
      colSpan || 1,
      bordersToMoveMap,
      grid
    );

    if (viewer) {
      gridCell.valueViewer = viewer;
    }

    nextGrid[row][col] = gridCell;
  }

  rootMergedCells.forEach(({ row, col, cell }) =>
    range(row, row + cell.rowSpan!).forEach((rowIdx) =>
      range(col, col + cell.colSpan!).forEach((colIdx) => {
        if (rowIdx === row && colIdx === col) {
          // skip for root cell
          return;
        }
        nextGrid[rowIdx][colIdx].mergedInto = { row, col };
      })
    )
  );

  assignBorders(bordersToMoveMap, nextGrid);

  return withOverflowCells(nextGrid, validCellUpdates, sheetAttributes, fullUpdate);
}

/**
 * Some borders will be invisible or too thick because our cells are actually divs positioned
 * together. So when we want to draw right and bottom borders for A1, we actually want to draw
 * left border for B1 and top border for A2.
 *
 * From said example, here we clean borders from A1 and "remember" them for A2 and B1.
 */
const moveBorders = (
  attributes: CellAttributes | undefined,
  row: number,
  rowSpan: number,
  col: number,
  colSpan: number,
  bordersToMoveMap: Record<string, BorderType[]>,
  grid: GridElement[][]
) => {
  if (attributes?.[CellAttribute.Border]) {
    let borders = (attributes?.[CellAttribute.Border]).split(" ");
    const targetRow = row + rowSpan;
    const targetCol = col + colSpan;
    if (borders.includes(BorderType.BorderRight) && targetCol < grid[row].length) {
      borders = without(borders, BorderType.BorderRight);
      if (!bordersToMoveMap[toA1(targetCol, row)]) {
        bordersToMoveMap[toA1(targetCol, row)] = [];
      }
      bordersToMoveMap[toA1(targetCol, row)].push(BorderType.BorderLeft);
    }
    if (borders.includes(BorderType.BorderBottom) && targetRow < grid.length) {
      borders = without(borders, BorderType.BorderBottom);
      if (!bordersToMoveMap[toA1(col, targetRow)]) {
        bordersToMoveMap[toA1(col, targetRow)] = [];
      }
      bordersToMoveMap[toA1(col, targetRow)].push(BorderType.BorderTop);
    }
    attributes[CellAttribute.Border] = borders.join(" ");
  }
};

/**
 * Assigns borders from other cells for better visibility.
 */
const assignBorders = (
  bordersToMoveMap: Record<string, BorderType[]>,
  grid: GridElement[][]
) => {
  for (const address in bordersToMoveMap) {
    const borders = bordersToMoveMap[address];
    const { x, y } = parseCellId(address) as ParsedSheetCell;
    const prevBorders = grid[y][x].attributes?.[CellAttribute.Border]?.split(" ") || [];
    const attributes = {
      ...(grid[y][x].attributes || {}),
      [CellAttribute.Border]: [...prevBorders, ...borders].join(" "),
    };
    grid[y][x] = {
      ...grid[y][x],
      attributes,
    };
    delete bordersToMoveMap[address];
  }
};

export const withOverflowCells = (
  grid: GridElement[][],
  cellUpdates: FilteredRemoteSheetCell[],
  sheetAttributes: SheetAttributes,
  fullUpdate?: boolean
): GridElement[][] => {
  const affectedCells: Record<number, { [key: number]: FullSheetCell }> = {};
  for (const cellUpdate of cellUpdates) {
    if (
      fullUpdate &&
      (cellUpdate.cell.attributes?.[CellAttribute.LineWrap] || LineWrapDefault) !==
        LineWrap.Overflow
    ) {
      continue;
    }
    if (!affectedCells[cellUpdate.row]) {
      affectedCells[cellUpdate.row] = {};
    }
    affectedCells[cellUpdate.row][cellUpdate.col] = cellUpdate.cell;
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const overflowCells: { row: number; col: number }[] = [];
  const colSizes = getColSizes(sheetAttributes, grid[0].length);
  const hiddenCols: number[] = getHiddenColHeaders(sheetAttributes, grid[0].length);

  const affectedRows = new Set(Object.keys(affectedCells));

  for (let row = 0; row < grid.length; row++) {
    if (!affectedRows.has(row.toString())) {
      continue;
    }

    for (let col = 0; col < grid[row].length; col++) {
      const cellUpdate = affectedCells[row][col];
      const gridCell = grid[row][col];

      if (gridCell.overflowFromCol !== undefined) {
        grid[row][col] = {
          ...gridCell,
          overflowFromCol: undefined,
        };
      }

      if (
        (gridCell.attributes?.[CellAttribute.LineWrap] || LineWrapDefault) ===
          LineWrap.Overflow &&
        !hiddenCols.includes(col)
      ) {
        if (cellUpdate) {
          const textPreview = getTextPreview(
            outputToData(cellUpdate.outputs),
            gridCell
          );
          grid[row][col].overflowColSpan = textPreviewToColspan(
            ctx,
            gridCell,
            textPreview,
            colSizes,
            col
          );
        }
        overflowCells.push({ row, col });
      }
    }
  }

  for (let overflowCell of overflowCells) {
    const { row, col } = overflowCell;
    withOverflowCell(
      grid[row],
      col,
      grid[row][col].overflowColSpan || 0,
      sheetAttributes
    );
  }

  return grid;
};

const textPreviewToColspan = (
  canvasContext: CanvasRenderingContext2D,
  cell: GridElement,
  textPreview: string,
  colSizes: NumberDict,
  col: number
): number => {
  const textStyles = cell.attributes?.[CellAttribute.TextStyle] || "";
  canvasContext.font = `${textStyles} ${
    cell.attributes?.[CellAttribute.FontSize] || DEFAULT_FONT_SIZE
  }pt ${cell.attributes?.[CellAttribute.Font] || ALLOWED_FONTS[0].cssName}`;
  let width = canvasContext.measureText(textPreview).width;
  let lastColIdx = col;
  do {
    width -= colSizes[lastColIdx];
    lastColIdx++;
  } while (width > 0);

  return lastColIdx - col;
};

const withOverflowCell = (
  row: GridElement[],
  col: number,
  colSpan: number,
  sheetAttributes: SheetAttributes
) => {
  if (colSpan === 0) {
    return;
  }

  // if cell sits in a "frozen" zone and is larged than frozen zone bounds, we have to "trim" it
  const colSpanWithFrozenCol =
    sheetAttributes.colsFrozenCount > col &&
    sheetAttributes.colsFrozenCount < col + colSpan
      ? sheetAttributes.colsFrozenCount - col
      : colSpan;

  // if cell is larger than grid, we have to trim it to fit grid.
  // if cell is in a frozen zone, we have to trim it to fit a frozen zone.
  const lastAffectedCell = Math.min(
    sheetAttributes.colsFrozenCount > col
      ? Math.min(sheetAttributes.colsFrozenCount, col + colSpan)
      : col + colSpan,
    row.length - 1
  );

  let hasValue = false;

  range(col, lastAffectedCell).forEach((colIdx) => {
    if (colIdx === col) {
      if (colSpanWithFrozenCol > 1) {
        row[colIdx].overflowColSpan = colSpanWithFrozenCol;
      }
      // skip for root cell
      return;
    }
    if (!hasValue && row[colIdx].value !== undefined && row[colIdx].value !== "") {
      hasValue = true;
      return;
    }
    row[colIdx].overflowFromCol = hasValue ? undefined : col;
  });
};

export function processCellUpdates(
  state: NeptyneContainerState,
  cellUpdates: RemoteSheetCell[],
  sheetAttributes: SheetAttributes,
  currentGrid?: GridElement[][]
): Pick<NeptyneContainerState, "grid" | "sheets"> {
  const { grid: prevGrid, sheets, currentSheet } = state;
  let grid = currentGrid || prevGrid;
  const newSheets = updateSheets(sheets, cellUpdates);
  const updatesForCurrentGrid = cellUpdates.filter((update) => {
    const parsed = parseCellId(getCellId(update));
    return !parsed.notebookCell && parsed.sheetId === currentSheet;
  });

  if (updatesForCurrentGrid.length > 0) {
    grid = updateGrid(grid, updatesForCurrentGrid, sheetAttributes);
  }

  return {
    // we actually need to update entire state here, because in previous steps we mutate some
    // other state entries. For example, we shrink selection when we delete rows/cols.
    ...state,
    grid,
    sheets: newSheets,
  };
}

/**
 * Transform CellChange to the changes used in kernel API
 * and optionally apply them to the grid.
 * @param grid - grid to mutate.
 * @param changes - internal frontend changes list.
 * @param sheetId - mutated sheet.
 * @param updateGrid - apply changes to grid param toggle.
 */
export function gridChangesToSheetAware(
  grid: GridElement[][],
  changes: CellChangeWithRowCol[],
  sheetId: number,
  updateGrid: boolean = true
): [grid: GridElement[][], changes: CellChange[]] {
  const nextGrid = updateGrid ? [...grid] : grid;
  const nextChanges = changes.map(({ row, col, value, attributes, mimeType }) => {
    const newExpression = value ?? "";

    if (updateGrid && !mimeType) {
      const nextRow = [
        ...(nextGrid?.[row] ||
          Array(grid[0].length).fill(() => ({ value: "", expression: "" }))),
      ];
      nextRow[col] = {
        ...nextRow[col],
        expression: newExpression,
        value: getCellFormattedValue(value, newExpression, attributes, true),
        isServerPending: true,
        valueViewer: undefined,
        attributes,
      };
      nextGrid[row] = nextRow;
    }

    const cellId: SheetCellId = [col, row, sheetId];

    return {
      cellId,
      content: newExpression,
      attributes,
      mimeType,
    };
  });

  return [nextGrid, nextChanges];
}

export function sheetAttributeUpdateToSheetAware(
  changes: SheetUnawareCellAttributeUpdate[],
  sheetId: number
): CellAttributeUpdate[] {
  return changes.map((change): CellAttributeUpdate => {
    return Object.fromEntries(
      Object.entries(change).map(([key, value]): [string, any] => {
        if (key === "cellId") {
          return [key, value.concat(sheetId)];
        }
        return [key, value];
      })
    ) as CellAttributeUpdate;
  });
}
