import {
  SelectionDirection,
  getSelectionDirection,
  getAdjustedOneDimensionSelection,
} from "./autofill";
import { SheetSelection } from "./SheetUtils";
import { SelectionRectangle, selectionToRect } from "./SheetUtils";

const SELECTION = {
  start: { row: 4, col: 4 },
  end: { row: 10, col: 7 },
};

const SELECTION_RECT = selectionToRect(SELECTION);

test.each<[SelectionRectangle, number, number, SelectionDirection | null]>([
  // check that moving inside initial selection does nothing
  [SELECTION_RECT, 4, 4, null],
  [SELECTION_RECT, 6, 6, null],
  [SELECTION_RECT, 10, 4, null],

  //   check that moving strictly below works
  [SELECTION_RECT, 20, 7, SelectionDirection.Bottom],
  [SELECTION_RECT, 20, 4, SelectionDirection.Bottom],

  // check that moving strictly to the right works
  [SELECTION_RECT, 10, 20, SelectionDirection.Right],
  [SELECTION_RECT, 4, 20, SelectionDirection.Right],

  // check that moving strictly to the top works
  [SELECTION_RECT, 0, 7, SelectionDirection.Top],
  [SELECTION_RECT, 0, 4, SelectionDirection.Top],

  // check that moving strictly to the left works
  [SELECTION_RECT, 10, 0, SelectionDirection.Left],
  [SELECTION_RECT, 4, 0, SelectionDirection.Left],

  // check that moving diagonaly works
  [SELECTION_RECT, 11, 9, SelectionDirection.Right],
  [SELECTION_RECT, 15, 0, SelectionDirection.Bottom],
  [SELECTION_RECT, 11, 0, SelectionDirection.Left],
  [SELECTION_RECT, 15, 3, SelectionDirection.Bottom],
  [SELECTION_RECT, 3, 9, SelectionDirection.Right],
  [SELECTION_RECT, 0, 8, SelectionDirection.Top],
  [SELECTION_RECT, 0, 3, SelectionDirection.Top],
  [SELECTION_RECT, 1, 0, SelectionDirection.Left],
  [SELECTION_RECT, 11, 0, SelectionDirection.Left],
  [SELECTION_RECT, 20, 0, SelectionDirection.Bottom],
])("getSelectionDirection selection %j row %s col %s", (selection, row, col, result) =>
  expect(getSelectionDirection(selection, row, col)).toBe(result)
);

test.each<[SheetSelection, number, number, SheetSelection]>([
  // check that moving inside initial selection does nothing
  [SELECTION, 4, 4, SELECTION],
  [SELECTION, 6, 6, SELECTION],
  [SELECTION, 10, 4, SELECTION],

  //   check that moving strictly below works
  [SELECTION, 20, 7, { start: SELECTION.start, end: { row: 20, col: 7 } }],
  [SELECTION, 20, 4, { start: SELECTION.start, end: { row: 20, col: 7 } }],

  // check that moving strictly to the right works
  [SELECTION, 10, 20, { start: SELECTION.start, end: { row: 10, col: 20 } }],
  [SELECTION, 4, 20, { start: SELECTION.start, end: { row: 10, col: 20 } }],

  // check that moving strictly to the top works
  [SELECTION, 0, 7, { start: { row: 0, col: 4 }, end: SELECTION.end }],
  [SELECTION, 0, 4, { start: { row: 0, col: 4 }, end: SELECTION.end }],

  // check that moving strictly to the left works
  [SELECTION, 10, 0, { start: { row: 4, col: 0 }, end: SELECTION.end }],
  [SELECTION, 4, 0, { start: { row: 4, col: 0 }, end: SELECTION.end }],

  // check that moving diagonaly works
  [SELECTION, 11, 9, { start: SELECTION.start, end: { row: 10, col: 9 } }],
  [SELECTION, 15, 0, { start: SELECTION.start, end: { row: 15, col: 7 } }],
  [SELECTION, 11, 0, { start: { row: 4, col: 0 }, end: SELECTION.end }],
  [SELECTION, 15, 3, { start: SELECTION.start, end: { row: 15, col: 7 } }],
  [SELECTION, 3, 9, { start: SELECTION.start, end: { row: 10, col: 9 } }],
  [SELECTION, 0, 8, { start: { row: 0, col: 4 }, end: SELECTION.end }],
  [SELECTION, 0, 3, { start: { row: 0, col: 4 }, end: SELECTION.end }],
  [SELECTION, 1, 0, { start: { row: 4, col: 0 }, end: SELECTION.end }],
  [SELECTION, 11, 0, { start: { row: 4, col: 0 }, end: SELECTION.end }],
  [SELECTION, 20, 0, { start: SELECTION.start, end: { row: 20, col: 7 } }],
])(
  "getAdjustedOneDimensionSelection selection %j row %s col %s result %j",
  (selection, row, col, result) =>
    expect(getAdjustedOneDimensionSelection(selection, row, col)).toEqual(result)
);
