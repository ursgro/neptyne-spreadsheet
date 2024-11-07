import { SheetUnawareCellId } from "./NeptyneProtocol";
import { SheetSelection } from "./SheetUtils";
import {
  SelectionRectangle,
  selectionToRect,
  isInSelection,
  getNormalizedSelection,
} from "./SheetUtils";

export enum AxisDirection {
  Forward = "forward",
  Backward = "backward",
  Static = "static",
}

export enum SelectionDirection {
  Top = "top",
  Bottom = "bottom",
  Right = "right",
  Left = "left",
}

/**
 * During autofill, we move selection in one of four directions - top, bottm. left, right.
 * But user can move cursor diagonally, so we need special logic to undestand the "primary"
 * movement vector.
 *
 * This function does that exact thing.
 */
export const getSelectionDirection = (
  sheetRect: SelectionRectangle,
  row: number,
  col: number
): SelectionDirection | null => {
  let verticalDelta = getAxisDelta(sheetRect.bottom, sheetRect.top, row);
  let horizontalDelta = getAxisDelta(sheetRect.right, sheetRect.left, col);

  if (!verticalDelta && !horizontalDelta) {
    return null;
  }

  if (Math.abs(verticalDelta) > Math.abs(horizontalDelta)) {
    return verticalDelta > 0 ? SelectionDirection.Bottom : SelectionDirection.Top;
  } else {
    return horizontalDelta > 0 ? SelectionDirection.Right : SelectionDirection.Left;
  }
};

/**
 * When cursor moves in a single direction, we have to detect whether it moved forward or backward
 * with respect to selection. So here we compare value with top and bottom value of selection.
 */
const getAxisDelta = (bottom: number, top: number, value: number): number => {
  if (value > bottom) return value - bottom;
  if (value < top) return value - top;
  return 0;
};

/**
 * Returns updated selection, extended only in one direction.
 *
 * According to Google Sheets logic, selection for dragging formulas can be extended only in one
 * direction - either vertically or horizontally. So we have to evaluate existing selection before
 * applying changes to ir.
 */
export const getAdjustedOneDimensionSelection = (
  sheetSelection: SheetSelection,
  row: number,
  col: number
): SheetSelection => {
  const sheetRect = selectionToRect(sheetSelection);
  // const isMovingBottomRight = row > sheetRect.bottom || col > sheetRect.right;
  if (isInSelection(selectionToRect(sheetSelection), row, col)) {
    // return initial selection is cursor returns inside its boundaries
    return sheetSelection;
  }
  const selectionDirection = getSelectionDirection(sheetRect, row, col);

  if (!selectionDirection) {
    return sheetSelection;
  }
  if (selectionDirection === SelectionDirection.Right) {
    return { ...sheetSelection, end: { ...sheetSelection.end, col: col } };
  } else if (selectionDirection === SelectionDirection.Left) {
    return { ...sheetSelection, start: { ...sheetSelection.start, col: col } };
  } else if (selectionDirection === SelectionDirection.Top) {
    return { ...sheetSelection, start: { ...sheetSelection.start, row: row } };
  } else if (selectionDirection === SelectionDirection.Bottom) {
    return { ...sheetSelection, end: { ...sheetSelection.end, row: row } };
  }
  throw new Error("We should not really get here");
};

/**
 * Converts grid/cell state into arguments for grid autofill.
 *
 * It allows to take a "sample" of data and populate it to a certain range of cells.
 *
 * Behavior is undefined if autofillSelection is equal to sheetSelection!
 *
 * @param autofillSelection
 * @param sheetSelection currently highlighted cells.
 *   They will be taken as a "sample data" that will be populated to the remaining range.
 * @param sheetId
 *
 * @returns args for API call. This API call will take data from sheetSelection and apply it
 *   to range from the beginning of sheetSelection up to the "edge" cell.
 */
export const selectionToAutofillDragArgs = (
  autofillSelection: SheetSelection,
  sheetSelection: SheetSelection
) => {
  let populateToStart: SheetUnawareCellId;
  let populateToEnd: SheetUnawareCellId;

  const normalizedSelection = getNormalizedSelection(sheetSelection);

  if (autofillSelection.end.row > normalizedSelection.end.row) {
    // autofill goes down
    populateToStart = [normalizedSelection.start.col, normalizedSelection.end.row + 1];
    populateToEnd = [autofillSelection.end.col, autofillSelection.end.row];
  } else if (autofillSelection.end.col > normalizedSelection.end.col) {
    // autofill goes to the right
    populateToStart = [normalizedSelection.end.col + 1, normalizedSelection.start.row];
    populateToEnd = [autofillSelection.end.col, autofillSelection.end.row];
  } else if (autofillSelection.start.row < normalizedSelection.start.row) {
    // autofill goes to the top
    populateToStart = [autofillSelection.start.col, autofillSelection.start.row];
    populateToEnd = [normalizedSelection.start.col, normalizedSelection.start.row - 1];
  } else {
    // autofill goes to the left
    populateToStart = [autofillSelection.start.col, autofillSelection.start.row];
    populateToEnd = [normalizedSelection.start.col - 1, normalizedSelection.start.row];
  }
  return {
    populateFrom: { ...normalizedSelection },
    populateToStart,
    populateToEnd,
  };
};
