import {
  CellChangeWithRowCol,
  GRID_HEIGHT,
  GRID_WIDTH,
} from "./neptyne-sheet/NeptyneSheet";
import { CellAttribute, Dimension } from "./NeptyneProtocol";
import { range } from "./react-datasheet/src/DataSheet";
import {
  GridElement,
  selectionToRect,
  getNormalizedSelection,
  toA1,
  SheetSelection,
  SheetUnawareCellAttributeUpdate,
} from "./SheetUtils";

export type NavigationDirection = "top" | "bottom" | "left" | "right";

export const generateToggleMergeCellsRequest = (
  grid: GridElement[][],
  selection: SheetSelection,
  action: "merge" | "unmerge"
): {
  valueUpdates: CellChangeWithRowCol[];
  attributeUpdates: SheetUnawareCellAttributeUpdate[];
  updatedGrid: GridElement[][];
} => {
  const updatedGrid = [...grid];
  const rect = selectionToRect(selection);
  const normalizedSelection = getNormalizedSelection(selection);

  let firstValue: GridElement["expression"] = "";
  const valueUpdates: CellChangeWithRowCol[] = [];
  const attributeUpdates: SheetUnawareCellAttributeUpdate[] = [];

  grid.forEach((row, rowId) => {
    if (rect.top > rowId || rect.bottom < rowId) {
      return;
    }
    const updatedRow = [...updatedGrid[rowId]];
    row.forEach((cell, colId) => {
      if (rect.left > colId || rect.right < colId) {
        return;
      }
      if (firstValue === "" && cell.value !== "" && cell.value !== undefined) {
        firstValue = cell.expression;
      }
      if (
        rowId === normalizedSelection.start.row &&
        colId === normalizedSelection.start.col
      ) {
        const rowSpan = action === "merge" ? rect.bottom - rect.top + 1 : undefined;
        const colSpan = action === "merge" ? rect.right - rect.left + 1 : undefined;
        attributeUpdates.push(
          {
            cellId: [normalizedSelection.start.col, normalizedSelection.start.row],
            attribute: CellAttribute.RowSpan,
            value: rowSpan,
          },
          {
            cellId: [normalizedSelection.start.col, normalizedSelection.start.row],
            attribute: CellAttribute.ColSpan,
            value: colSpan,
          }
        );
        const attributes = cell.attributes || {};
        if (rowSpan) {
          attributes[CellAttribute.RowSpan] = rowSpan.toString();
        } else {
          delete attributes[CellAttribute.RowSpan];
        }
        if (colSpan) {
          attributes[CellAttribute.ColSpan] = colSpan.toString();
        } else {
          delete attributes[CellAttribute.ColSpan];
        }
        updatedRow[normalizedSelection.start.col] = {
          ...cell,
          [CellAttribute.RowSpan]: rowSpan,
          [CellAttribute.ColSpan]: colSpan,
          attributes,
        };
      } else {
        const mergedInto =
          action === "merge" ? { ...normalizedSelection.start } : undefined;
        valueUpdates.push({
          row: rowId,
          col: colId,
          value: null,
        });
        updatedRow[colId] = {
          ...cell,
          mergedInto,
          value: null,
        };
      }
    });
    updatedGrid[rowId] = updatedRow;
  });

  valueUpdates.unshift({
    row: normalizedSelection.start.row,
    col: normalizedSelection.start.col,
    value: firstValue,
  });
  updatedGrid[normalizedSelection.start.row][normalizedSelection.start.col] = {
    ...updatedGrid[normalizedSelection.start.row][normalizedSelection.start.col],
    value: firstValue,
  };

  return { valueUpdates, attributeUpdates, updatedGrid };
};

/**
 * If given cell is a part of cell merge, it gives the "opposite" side of it.
 *
 * If we gave A1:B2 merge and provide A1 cell, we return B2. If we provide B2 or anything else - we
 * return A1.
 */
const getOppositeCellOfMerge = (
  cell: GridElement,
  row: number,
  col: number
): { row: number; col: number } | null => {
  if (cell.rowSpan && cell.colSpan) {
    return { row: row + cell.rowSpan - 1, col: col + cell.colSpan - 1 };
  }
  if (cell.mergedInto) {
    return cell.mergedInto;
  }
  return null;
};

/**
 * Updates closes selection corner with newCoord value.
 */
const mutateSelectionWithNewBorder = (
  selection: SheetSelection,
  dimension: "row" | "col",
  newCoord: number,
  oldCoord: number
) => {
  if (newCoord !== oldCoord) {
    const closestXLocation: keyof SheetSelection =
      Math.abs(newCoord - selection.start[dimension]) <
      Math.abs(newCoord - selection.end[dimension])
        ? "start"
        : "end";

    selection[closestXLocation][dimension] = newCoord;
  }
};

export const getSelectionWithMergedCells = (
  selection: SheetSelection,
  grid: GridElement[][],
  direction?: NavigationDirection
): SheetSelection => {
  const pushedSelection = pushSelection(selection, grid, direction);
  const mergedSelection = _getSelectionWithMergedCells(
    pushedSelection,
    grid,
    direction
  );
  return mergedSelection;
};

/**
 * Returns "main" cell of a merge.
 *
 * Returns self if it is already main cell.
 *
 * Returns self if cell is unmerged.
 *
 * Also returns two flags that determine if merge cell takes multiple rows/cols respectively.
 */
export const getRootMergeCellCoords = (
  grid: GridElement[][],
  row: number,
  col: number
): [
  coords: { row: number; col: number },
  isRowMerged: boolean,
  isColMerged: boolean
] => {
  const cell = grid[row][col];
  if (cell.rowSpan && cell.colSpan) {
    return [{ row, col }, cell.rowSpan > 1, cell.colSpan > 1];
  }
  if (cell.mergedInto) {
    const rootCell = grid[cell.mergedInto.row][cell.mergedInto.col];
    return [cell.mergedInto, rootCell.rowSpan! > 1, rootCell.colSpan! > 1];
  }
  return [{ row, col }, false, false];
};

/**
 * Returns coordinates of a next "root" cell or unmerged cell.
 */
const getNextCellCoords = (
  grid: GridElement[][],
  start: { row: number; col: number },
  delta: { row: number; col: number }
): { row: number; col: number } | null => {
  const [startRootCell] = getRootMergeCellCoords(grid, start.row, start.col);
  let currentRow = start.row + delta.row;
  let currentCol = start.col + delta.col;

  while (currentRow < GRID_HEIGHT && currentCol < GRID_WIDTH) {
    const [rootCell] = getRootMergeCellCoords(grid, currentRow, currentCol);

    if (startRootCell.row !== rootCell.row || startRootCell.col !== rootCell.col) {
      return rootCell;
    }
    currentRow += delta.row;
    currentCol += delta.col;
  }
  return null;
};

/**
 * Forcefully leaves merged cell out of selection.
 *
 * Suppose we have A1:C3 selection, and B2:C3 cells are merged. So if we press up arrow, we won't
 * be able to leave B2:C3 cell because we will still remain in this cell. So we take a movement
 * direction, decide if we need to move, and return updated selection.
 */
const pushSelection = (
  selection: SheetSelection,
  grid: GridElement[][],
  direction?: NavigationDirection
): SheetSelection => {
  if (!direction) {
    return selection;
  }

  const isSingleCell =
    selection.start.row === selection.end.row &&
    selection.start.col === selection.end.col;

  const deltaX = (direction === "left" && -1) || (direction === "right" && 1) || 0;
  const deltaY = (direction === "top" && -1) || (direction === "bottom" && 1) || 0;

  const nextCell = grid[selection.end.row + deltaY]?.[selection.end.col + deltaX];

  if (!nextCell) {
    return selection;
  }

  const [endCellRoot, isEndRowMerged, isEndColMerged] = getRootMergeCellCoords(
    grid,
    selection.end.row,
    selection.end.col
  );
  const isEndCellMerged = (deltaY && isEndRowMerged) || (deltaX && isEndColMerged);
  if (!isEndCellMerged) {
    return selection;
  }
  const [nextCellRoot] = getRootMergeCellCoords(
    grid,
    selection.end.row + deltaY,
    selection.end.col + deltaX
  );

  if (endCellRoot.col === nextCellRoot.col && endCellRoot.row === nextCellRoot.row) {
    return selection;
  }

  const nextCellCoords = getNextCellCoords(
    grid,
    { row: selection.end.row, col: selection.end.col },
    { row: deltaY, col: deltaX }
  );

  if (!nextCellCoords) {
    return selection;
  }

  selection.end = { ...nextCellCoords };

  if (isSingleCell) {
    selection.start = { ...nextCellCoords };
  }

  return selection;
};

/**
 * Expand selection to entirely include merged cells on collision.
 *
 * Say, we have A1:B2 cell. But B2 is actually merged with B3. In this case, we have to return
 * A1:B3 selection.
 */
export const _getSelectionWithMergedCells = (
  selection: SheetSelection,
  grid: GridElement[][],
  direction?: NavigationDirection
): SheetSelection => {
  const { top, bottom, left, right } = selectionToRect(selection);

  // find cells that are merged and have parts outside of selection
  const mergedOutOfBoundsCells = range(top, bottom)
    .flatMap((row) =>
      range(left, right).map((col) => {
        const oppositeCell = getOppositeCellOfMerge(grid[row][col], row, col);

        if (!oppositeCell) {
          return null;
        }

        const isOutOfBounds =
          oppositeCell.row < top ||
          oppositeCell.row > bottom ||
          oppositeCell.col < left ||
          oppositeCell.col > right;
        return isOutOfBounds ? oppositeCell : null;
      })
    )
    .filter((mergedInto) => !!mergedInto) as { row: number; col: number }[];

  // do nothing if selection contains cells entirely.
  // Normalize selection if selection contains one and only one merged cell.
  if (!mergedOutOfBoundsCells.length) {
    const isSelectionInSingleCell =
      new Set(
        ...range(selection.start.row, selection.end.row).flatMap((row) =>
          range(selection.start.col, selection.end.col)
            .map((col) => getRootMergeCellCoords(grid, row, col)[0])
            .map(({ row, col }) => toA1(col, row))
        )
      ).size === 1;

    return isSelectionInSingleCell ? getNormalizedSelection(selection) : selection;
  }

  let updatedSelection: SheetSelection = {
    start: { ...selection.start },
    end: { ...selection.end },
  };

  // find and set new borders of selection
  const minX = Math.min(left, ...mergedOutOfBoundsCells.map(({ col }) => col));
  const maxX = Math.max(right, ...mergedOutOfBoundsCells.map(({ col }) => col));
  const minY = Math.min(top, ...mergedOutOfBoundsCells.map(({ row }) => row));
  const maxY = Math.max(bottom, ...mergedOutOfBoundsCells.map(({ row }) => row));

  mutateSelectionWithNewBorder(updatedSelection, "col", minX, left);
  mutateSelectionWithNewBorder(updatedSelection, "col", maxX, right);
  mutateSelectionWithNewBorder(updatedSelection, "row", minY, top);
  mutateSelectionWithNewBorder(updatedSelection, "row", maxY, bottom);

  return _getSelectionWithMergedCells(updatedSelection, grid);
};

export const hasMergedCells = (
  grid: GridElement[][],
  selection: SheetSelection
): boolean => {
  const normalizedSelection = getNormalizedSelection(selection);

  return range(normalizedSelection.start.row, normalizedSelection.end.row)
    .flatMap((rowIndex) =>
      range(normalizedSelection.start.col, normalizedSelection.end.col).map(
        (colIndex) => grid[rowIndex][colIndex]
      )
    )
    .some((cell) => cell.rowSpan && cell.colSpan);
};

export const getRootCellCoords = (
  cell: GridElement,
  row: number,
  col: number
): { rootCol?: number; rootRow?: number } => {
  const rootRow = cell.rowSpan ? row : cell.mergedInto?.row;
  const rootCol = cell.colSpan ? col : cell.mergedInto?.col;
  return {
    rootRow,
    rootCol,
  };
};

export const overlapsWithMergedCells = (
  dimension: Dimension,
  index: number,
  grid: GridElement[][]
) => {
  const cellsInDimension =
    dimension === Dimension.Col ? grid.map((row) => row[index]) : grid[index];

  return cellsInDimension.some(
    (cell) => cell.mergedInto && cell.mergedInto[dimension] < index
  );
};
