import {
  extractResearchTableFromSheet,
  SOURCES_LABEL,
  updateSheetWithResearchTable,
} from "./aiResearch";
import { ResearchTable } from "./NeptyneProtocol";

const gridFromMarkup = (markup: string) => {
  const rowToValue = (row: string) => {
    return row.split("|").map((cell) => ({
      value: cell.trim(),
    }));
  };

  const rows = markup.split("\n").map(rowToValue);
  const maxLength = Math.max(...rows.map((row) => row.length));

  return rows.map((row) => {
    const rowLength = row.length;
    if (rowLength < maxLength) {
      return [
        ...row,
        ...Array.from({ length: maxLength - rowLength }, () => ({ value: "" })),
      ];
    }
    return row;
  });
};
const emptyGrid = (width: number, height: number) => {
  return Array(height)
    .fill(null)
    .map(() => Array(width).fill({ value: "" }));
};

test("research table extraction", () => {
  const grid = gridFromMarkup("Country|Capital\nGermany|Berlin\nFrance|Paris\n|\n");
  const researchTable = extractResearchTableFromSheet(grid, 0, 0);
  expect(researchTable.table).toEqual([
    ["Country", "Capital"],
    ["Germany", "Berlin"],
    ["France", "Paris"],
  ]);
  const researchTableCutOff = extractResearchTableFromSheet(grid, 0, 0, 2, 2);
  expect(researchTableCutOff.table).toEqual([
    ["Country", "Capital"],
    ["Germany", "Berlin"],
  ]);
  const researchTableWithEmptyRows = extractResearchTableFromSheet(grid, 0, 0, 2, 5);
  expect(researchTableWithEmptyRows.table).toEqual([
    ["Country", "Capital"],
    ["Germany", "Berlin"],
    ["France", "Paris"],
    ["", ""],
    ["", ""],
  ]);
});

const applyUpdatesToGrid = (
  updates: { col: number; row: number; value: string }[],
  grid: { value: string }[][]
) => {
  updates.forEach((update) => {
    if (!grid[update.row]) grid[update.row] = [];
    grid[update.row][update.col] = { value: update.value };
  });
  return grid;
};

test("sheet update with research table", () => {
  const initialGrid = emptyGrid(5, 5);
  const mockUpdateCellValues = jest.fn((updates) =>
    applyUpdatesToGrid(updates, initialGrid)
  );
  const researchTable: ResearchTable = {
    table: [
      ["Country", "Capital"],
      ["Germany", "Berlin"],
      ["France", "Paris"],
    ],
    sources: [],
  };

  updateSheetWithResearchTable(
    researchTable,
    { col: 0, row: 0 },
    mockUpdateCellValues,
    0
  );

  const expectedGrid = gridFromMarkup("Country|Capital\nGermany|Berlin\nFrance|Paris");

  const slicedInitialGrid = initialGrid
    .slice(0, expectedGrid.length)
    .map((row) => row.slice(0, expectedGrid[0].length));
  expect(slicedInitialGrid).toEqual(expectedGrid);
});

test("source extraction from grid", () => {
  const grid = gridFromMarkup(`
    Country|Capital
    France|Paris
    Sources:
    Title1|URL1|=ai.sources(A1)
    Title2|URL2|=ai.sources(B2, C2, B3)
  `);

  const researchTable = extractResearchTableFromSheet(grid, 0, 1);
  expect(researchTable.sources).toEqual([
    { title: "Title1", url: "URL1", cells: [{ col: 0, row: 0 }] },
    {
      title: "Title2",
      url: "URL2",
      cells: [
        { col: 1, row: 1 },
        { col: 2, row: 1 },
        { col: 1, row: 2 },
      ],
    },
  ]);
});

test("sheet update of sources", () => {
  const initialGrid = emptyGrid(10, 5);
  const mockUpdateCellValues = jest.fn((updates) =>
    applyUpdatesToGrid(updates, initialGrid)
  );

  const researchTable: ResearchTable = {
    table: [],
    sources: [
      { title: "Title1", url: "URL1", cells: [{ col: 0, row: 0 }] },
      { title: "Title2", url: "URL2", cells: [{ col: 1, row: 1 }] },
    ],
  };

  updateSheetWithResearchTable(
    researchTable,
    { col: 0, row: 0 },
    mockUpdateCellValues,
    0
  );
  expect(initialGrid[1][0].value).toEqual(SOURCES_LABEL);
  expect(initialGrid[2][0].value).toEqual("Title1");
  expect(initialGrid[2][1].value).toEqual("URL1");
  expect(initialGrid[3][2].value).toContain("B2");
});

test("round-trip: extract, update, extract", () => {
  const originalMarkup = "Country|Capital||\nGermany|Berlin\nFrance|Paris";
  const originalGrid = gridFromMarkup(originalMarkup);
  const extractedTable = extractResearchTableFromSheet(originalGrid, 0, 0);

  const newGrid = emptyGrid(originalGrid[0].length, originalGrid.length);
  const mockUpdateCellValues = jest.fn((updates) =>
    applyUpdatesToGrid(updates, newGrid)
  );

  updateSheetWithResearchTable(
    extractedTable,
    { col: 0, row: 0 },
    mockUpdateCellValues,
    0
  );

  expect(newGrid).toEqual(originalGrid);
});
