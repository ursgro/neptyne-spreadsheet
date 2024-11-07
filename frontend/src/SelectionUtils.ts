import { globalToVisibleIndex, visibleToGlobalIndex } from "./neptyne-sheet/GridView";
import { SheetSelection, SheetLocation, OptionalSelection } from "./SheetUtils";

export const getVirtualScrollSelection = (
  selection: SheetSelection,
  hiddenRows: number[],
  hiddenColumns: number[]
): SheetSelection => {
  return {
    start: {
      row: globalToVisibleIndex(selection.start.row, hiddenRows),
      col: globalToVisibleIndex(selection.start.col, hiddenColumns),
    },
    end: {
      row: globalToVisibleIndex(selection.end.row, hiddenRows),
      col: globalToVisibleIndex(selection.end.col, hiddenColumns),
    },
  };
};

export const getSafeAbsoluteSelection = (
  selection: OptionalSelection,
  originalSelection: SheetSelection,
  hiddenRows: number[],
  hiddenCols: number[]
): SheetSelection => {
  const start = getSafeAbsolutePoint(
    "start",
    selection,
    originalSelection,
    hiddenRows,
    hiddenCols
  );
  const end = getSafeAbsolutePoint(
    "end",
    selection,
    originalSelection,
    hiddenRows,
    hiddenCols
  );

  return {
    start,
    end,
  };
};

const getSafeAbsolutePoint = (
  pointName: "start" | "end",
  selection: OptionalSelection,
  originalSelection: SheetSelection,
  hiddenRows: number[],
  hiddenCols: number[]
) => {
  let newPoint = selection[pointName];
  let adjustedNewPoint;
  if (newPoint) {
    adjustedNewPoint = {
      row: visibleToGlobalIndex(newPoint.row, hiddenRows),
      col: visibleToGlobalIndex(newPoint.col, hiddenCols),
    };
  } else {
    adjustedNewPoint = originalSelection[pointName];
  }
  return adjustedNewPoint;
};

export const locationsAreEqual = (lhs: SheetLocation, rhs: SheetLocation) => {
  return lhs.row === rhs.row && lhs.col === rhs.col;
};

export const selectionsAreEqual = (lhs: SheetSelection, rhs: SheetSelection) => {
  return locationsAreEqual(lhs.start, rhs.start) && locationsAreEqual(lhs.end, rhs.end);
};
