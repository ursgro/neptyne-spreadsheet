import { isEqual } from "lodash";

import {
  getNormalizedSelection,
  GridElement,
  SheetSelection,
  SheetUnawareCellAttributeUpdate,
} from "../../SheetUtils";
import { BorderType, CellAttribute, SheetUnawareCellId } from "../../NeptyneProtocol";
import { SheetLocation } from "../../SheetUtils";

export enum BorderAttribute {
  All = "border-all",
  Top = "border-top",
  Bottom = "border-bottom",
  Left = "border-left",
  Right = "border-right",
  Horizontal = "border-horizontal",
  Vertical = "border-vertical",
  Inner = "border-inner",
  Outer = "border-outer",
  Clear = "border-clear",
}

const BORDER_ATTRIBUTES_MAPPING: {
  [key: string]: BorderType[];
} = {
  [BorderAttribute.All]: [
    BorderType.BorderRight,
    BorderType.BorderBottom,
    BorderType.BorderLeft,
    BorderType.BorderTop,
  ],
  [BorderAttribute.Top]: [BorderType.BorderTop],
  [BorderAttribute.Bottom]: [BorderType.BorderBottom],
  [BorderAttribute.Left]: [BorderType.BorderLeft],
  [BorderAttribute.Right]: [BorderType.BorderRight],
  [BorderAttribute.Horizontal]: [BorderType.BorderBottom],
  [BorderAttribute.Vertical]: [BorderType.BorderRight],
};

interface HandleCellBordersProps {
  grid: GridElement[][];
  cellAttribute: CellAttribute;
  attributeValue: string;
  sheetSelection: SheetSelection;
  onCellAttributeChange: (changes: SheetUnawareCellAttributeUpdate[]) => void;
}

interface CellToProcess {
  cellId: SheetUnawareCellId;
  borders: Set<string>;
}

interface BorderSelection {
  start: SheetLocation;
  end: SheetLocation;
}

const selectionForBorderRight = (start: SheetLocation, end: SheetLocation) => {
  // the right side of selection (with end.j)
  return {
    start: { row: start.row, col: end.col },
    end: { row: end.row, col: end.col },
  };
};

const selectionForBorderLeft = (
  start: SheetLocation,
  end: SheetLocation
): BorderSelection => {
  // the left side of selection (with start.j)
  return {
    start: { row: start.row, col: start.col },
    end: { row: end.row, col: start.col },
  };
};

const selectionForBorderBottom = (
  start: SheetLocation,
  end: SheetLocation
): BorderSelection => {
  // the bottom side of selection (with end.i)
  return {
    start: { row: end.row, col: start.col },
    end: { row: end.row, col: end.col },
  };
};

const selectionForBorderTop = (
  start: SheetLocation,
  end: SheetLocation
): BorderSelection => {
  // the top side of selection (with start.i)
  return {
    start: { row: start.row, col: start.col },
    end: { row: start.row, col: end.col },
  };
};

const selectionForBorderHorizontal = (
  start: SheetLocation,
  end: SheetLocation
): BorderSelection => {
  // from i = min to i = max-1 (if num of rows > 1)
  return {
    start: { row: start.row, col: start.col },
    end: { row: end.row - 1, col: end.col },
  };
};

const selectionForBorderVertical = (
  start: SheetLocation,
  end: SheetLocation
): BorderSelection => {
  // from j = min to j = max-1 (if num of columns > 1)
  return {
    start: { row: start.row, col: start.col },
    end: { row: end.row, col: end.col - 1 },
  };
};

const selectionForNeighborsAbove = (
  start: SheetLocation,
  end: SheetLocation
): BorderSelection => {
  // all j's (from min to max)
  return {
    start: { row: start.row - 1, col: start.col },
    end: { row: start.row - 1, col: end.col },
  };
};

const selectionForBottomNeighbors = (
  start: SheetLocation,
  end: SheetLocation
): BorderSelection => {
  // all j's (from min to max)
  return {
    start: { row: end.row + 1, col: start.col },
    end: { row: end.row + 1, col: end.col },
  };
};

const selectionForNeighborsLeft = (
  start: SheetLocation,
  end: SheetLocation
): BorderSelection => {
  // all i's (from min to max)
  return {
    start: { row: start.row, col: start.col - 1 },
    end: { row: end.row, col: start.col - 1 },
  };
};

const selectionForNeighborsRight = (
  start: SheetLocation,
  end: SheetLocation
): BorderSelection => {
  // all i's (from min to max)
  return {
    start: { row: start.row, col: end.col + 1 },
    end: { row: end.row, col: end.col + 1 },
  };
};

const isSelectionValid = (
  start: SheetLocation,
  end: SheetLocation,
  grid: GridElement[][]
) =>
  !(
    start.row < 0 ||
    start.col < 0 ||
    end.row >= grid.length ||
    end.col >= grid[0].length
  );

const addCellBorder = (
  cellId: SheetUnawareCellId,
  attributeValue: string,
  cell: GridElement
) => {
  const cellBorders = getCellBorders(cell);
  const bordersToAdd = BORDER_ATTRIBUTES_MAPPING[attributeValue] ?? [attributeValue];
  bordersToAdd.forEach((border: string) => {
    cellBorders.add(border);
  });

  return {
    cellId,
    borders: cellBorders,
  };
};

const removeCellBorder = (
  cellId: SheetUnawareCellId,
  attributeValue: string,
  cell: GridElement
) => {
  let returnValue = {
    cellId,
    borders: new Set<string>(),
  };
  if (attributeValue === BorderAttribute.Clear) return returnValue;

  const cellBorders = getCellBorders(cell);
  if (cellBorders.has(attributeValue)) {
    cellBorders.delete(attributeValue);
  }

  returnValue.borders = cellBorders;
  return returnValue;
};

const getCellsFromSelection = (
  start: SheetLocation,
  end: SheetLocation,
  grid: GridElement[][],
  attributeValue: string,
  isRemove: boolean
): CellToProcess[] => {
  let cellsToProcess: CellToProcess[] = [];

  if (!isSelectionValid(start, end, grid)) {
    return cellsToProcess;
  }

  for (let i = start.row; i <= end.row; i++) {
    for (let j = start.col; j <= end.col; j++) {
      const cell = grid[i][j];
      const cellToProcess = isRemove
        ? removeCellBorder([j, i], attributeValue, cell)
        : addCellBorder([j, i], attributeValue, cell);

      // do not process a cell whose borders are not changed
      const borders = getCellBorders(cell);
      if (!isEqual(borders, cellToProcess?.borders)) {
        cellsToProcess.push(cellToProcess);
      }
    }
  }

  return cellsToProcess;
};

const getCellBorders = (cell: GridElement): Set<string> => {
  const cellBorderAttribute = cell?.attributes
    ? cell.attributes[CellAttribute.Border]
    : "";
  const borders = cellBorderAttribute ? cellBorderAttribute.split(" ") : [];
  return new Set<string>(borders);
};

const mergeBorderAttributes = (cells: CellToProcess[]): CellToProcess[] => {
  const mergedCells: { [key: string]: CellToProcess } = {};

  cells.forEach((cell) => {
    const key = cell.cellId.join("-");
    if (!mergedCells[key]) {
      mergedCells[key] = { ...cell };
    } else {
      mergedCells[key].borders = new Set<string>([
        ...Array.from(mergedCells[key].borders),
        ...Array.from(cell.borders),
      ]);
    }
  });

  return Object.values(mergedCells);
};

const getCellsToProcess = (
  attributeValue: string,
  sheetSelection: SheetSelection,
  grid: GridElement[][]
): CellToProcess[] => {
  const handleBorderUpdate = (
    selection: BorderSelection,
    borderAttribute?: string,
    isRemove: boolean = false
  ) => {
    return getCellsFromSelection(
      selection.start,
      selection.end,
      grid,
      borderAttribute ?? attributeValue,
      isRemove
    );
  };

  const { start, end } = getNormalizedSelection(sheetSelection);
  switch (attributeValue) {
    case BorderAttribute.All:
      return handleBorderUpdate({ start, end });
    case BorderAttribute.Right:
      return handleBorderUpdate(selectionForBorderRight(start, end));
    case BorderAttribute.Left:
      return handleBorderUpdate(selectionForBorderLeft(start, end));
    case BorderAttribute.Bottom:
      return handleBorderUpdate(selectionForBorderBottom(start, end));
    case BorderAttribute.Top:
      return handleBorderUpdate(selectionForBorderTop(start, end));
    case BorderAttribute.Horizontal:
      return handleBorderUpdate(selectionForBorderHorizontal(start, end));
    case BorderAttribute.Vertical:
      return handleBorderUpdate(selectionForBorderVertical(start, end));
    case BorderAttribute.Outer:
      return mergeBorderAttributes([
        ...handleBorderUpdate(
          selectionForBorderRight(start, end),
          BorderType.BorderRight
        ),
        ...handleBorderUpdate(
          selectionForBorderLeft(start, end),
          BorderType.BorderLeft
        ),
        ...handleBorderUpdate(
          selectionForBorderBottom(start, end),
          BorderType.BorderBottom
        ),
        ...handleBorderUpdate(selectionForBorderTop(start, end), BorderType.BorderTop),
      ]);
    case BorderAttribute.Inner:
      return mergeBorderAttributes([
        ...handleBorderUpdate(
          selectionForBorderHorizontal(start, end),
          BorderType.BorderBottom
        ),
        ...handleBorderUpdate(
          selectionForBorderVertical(start, end),
          BorderType.BorderRight
        ),
      ]);
    case BorderAttribute.Clear:
      return [
        ...handleBorderUpdate({ start, end }, BorderAttribute.Clear, true),
        ...handleBorderUpdate(
          selectionForNeighborsAbove(start, end),
          BorderType.BorderBottom,
          true
        ),
        ...handleBorderUpdate(
          selectionForBottomNeighbors(start, end),
          BorderType.BorderTop,
          true
        ),
        ...handleBorderUpdate(
          selectionForNeighborsLeft(start, end),
          BorderType.BorderRight,
          true
        ),
        ...handleBorderUpdate(
          selectionForNeighborsRight(start, end),
          BorderType.BorderLeft,
          true
        ),
      ];
    default:
      return [];
  }
};

export const handleCellBorders = ({
  grid,
  cellAttribute,
  attributeValue,
  sheetSelection,
  onCellAttributeChange,
}: HandleCellBordersProps): void => {
  const changes: SheetUnawareCellAttributeUpdate[] = [];
  const cellsToProcess = getCellsToProcess(attributeValue, sheetSelection, grid);
  for (let cellToProcess of cellsToProcess) {
    const borderAttribute = Array.from(cellToProcess.borders).join(" ");
    changes.push({
      cellId: cellToProcess.cellId,
      attribute: cellAttribute,
      value: borderAttribute,
    });
  }
  onCellAttributeChange(changes);
};
