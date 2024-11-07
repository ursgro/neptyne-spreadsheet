import "./jest-mock-tinygesture";
import { getSelectionWithMergedCells, NavigationDirection } from "./merge-cells";
import { updateGrid } from "./neptyne-container/gridUpdateUtils";
import { createGrid, GridElement, SheetSelection } from "./SheetUtils";
import flatten from "lodash/flatten";
import { SheetCellId } from "./NeptyneProtocol";

const createMockGrid = (): GridElement[][] => {
  const grid = createGrid(26, 1000);
  grid[3][4] = {
    value: "1",
    expression: "=1",
    attributes: {
      colSpan: "3",
      rowSpan: "1",
    },
  };

  grid[6][2] = {
    value: "1",
    expression: "=1",
    attributes: {
      colSpan: "1",
      rowSpan: "4",
    },
  };

  grid[12][7] = {
    value: "1",
    expression: "=1",
    attributes: {
      colSpan: "3",
      rowSpan: "3",
    },
  };

  return grid;
};

test("grid annotation", () => {
  const grid = updateGrid(
    createGrid(24, 1000),
    flatten(
      createMockGrid().map((row, rowIdx) =>
        row.map((col, colIdx) => ({
          cellId: [colIdx, rowIdx, 0] as SheetCellId,
          code: col.expression || "",
          attributes: col.attributes || {},
          dependsOn: [] as SheetCellId[],
        }))
      )
    ),
    Array(24).fill(100)
  );
  expect(grid[0][0].rowSpan).toBe(undefined);
  expect(grid[0][0].colSpan).toBe(undefined);

  expect(grid[3][4].rowSpan).toBe(1);
  expect(grid[3][4].colSpan).toBe(3);

  expect(grid[6][2].rowSpan).toBe(4);
  expect(grid[6][2].colSpan).toBe(1);

  expect(grid[12][7].rowSpan).toBe(3);
  expect(grid[12][7].colSpan).toBe(3);
});

test.each<[SheetSelection, NavigationDirection | undefined, SheetSelection]>([
  [
    { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
    undefined,
    { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
  ],
  [
    { start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
    undefined,
    { start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
  ],
  [
    { start: { row: 5, col: 2 }, end: { row: 6, col: 2 } },
    undefined,
    { start: { row: 5, col: 2 }, end: { row: 9, col: 2 } },
  ],
  [
    { start: { row: 5, col: 2 }, end: { row: 6, col: 2 } },
    "bottom",
    { start: { row: 5, col: 2 }, end: { row: 9, col: 2 } },
  ],
  [
    { start: { row: 5, col: 2 }, end: { row: 9, col: 2 } },
    "bottom",
    { start: { row: 5, col: 2 }, end: { row: 10, col: 2 } },
  ],
  [
    { start: { row: 6, col: 1 }, end: { row: 6, col: 2 } },
    "right",
    { start: { row: 6, col: 1 }, end: { row: 9, col: 2 } },
  ],
  [
    { start: { row: 6, col: 2 }, end: { row: 6, col: 2 } },
    "right",
    { start: { row: 6, col: 2 }, end: { row: 9, col: 2 } },
  ],
])("getSelectionWithMergedCells", (selection, direction, result) => {
  expect(
    getSelectionWithMergedCells(
      selection,
      updateGrid(
        createGrid(24, 1000),
        flatten(
          createMockGrid().map((row, rowIdx) =>
            row.map((col, colIdx) => ({
              cellId: [colIdx, rowIdx, 0] as SheetCellId,
              code: col.expression || "",
              attributes: col.attributes || {},
              dependsOn: [] as SheetCellId[],
            }))
          )
        ),
        Array(24).fill(100)
      ),
      direction
    )
  ).toMatchObject(result);
});
