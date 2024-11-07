import { ResearchCell, ResearchTable } from "./NeptyneProtocol";
import { getGSheetAppConfig } from "./gsheet_app_config";
import {
  GridElement,
  parseCellId,
  SheetLocation,
  SheetSelection,
  toA1,
} from "./SheetUtils";
import { CellChangeWithRowCol } from "./neptyne-sheet/NeptyneSheet";
import { ResearchMetaData } from "./ResearchPanel";

export const SOURCES_LABEL = "Sources:";

export interface CellRef {
  col: number;
  row: number;
}

export interface SimpleCell {
  value: string | number | null;
}

export interface Prefill {
  prompt: string;
  headers: string[];
  count: number;
}

export const prefills: Prefill[] = [
  {
    prompt: "Benelux countries",
    headers: ["Country", "Capital", "Languages"],
    count: 5,
  },
  {
    prompt: "Richest countries in Europe",
    headers: ["Country", "GDP PPP", "GDP Nominal", "Capital", "Population"],
    count: 15,
  },
  {
    prompt: "2023 New Unicorns",
    headers: ["Company", "Valuation", "Country", "CEO"],
    count: 20,
  },
  {
    prompt: "Bookable passenger journeys across the atlantic",
    headers: ["Line", "Crossing time", "Price", "Departure port", "Arrival port"],
    count: 10,
  },
  {
    prompt: "Fastest 100 meter dash times",
    headers: ["Runner", "Time", "Country", "Age of runner"],
    count: 10,
  },
  {
    prompt: "Tallest mountains and climbers",
    headers: [
      "Mountain",
      "Height",
      "Lat",
      "Lng",
      "First climber name",
      "First climbed year",
      "Nationality",
    ],
    count: 14,
  },
  {
    prompt: "Fastest cars",
    headers: ["Car", "0-60", "Engine", "Year"],
    count: 10,
  },
  {
    prompt: "Famous inventions",
    headers: ["Inventor", "Invention", "Year"],
    count: 10,
  },
  {
    prompt: "Famous inventors",
    headers: ["Inventor", "Inventions", "Birth", "Death"],
    count: 10,
  },
  {
    prompt: "Cat breeds",
    headers: ["Breed", "Origin", "Body", "Coat"],
    count: 10,
  },
  {
    prompt: "Superbowl winners",
    headers: [
      "Year",
      "Winner",
      "Score",
      "MVP",
      "Halftime show",
      "Year first record of halftime show",
    ],
    count: 20,
  },
  {
    prompt: "Largest steel manufacturers in Russia",
    headers: ["Company", "Production", "Employees", "Location"],
    count: 0,
  },
  {
    prompt: "Pre-socratic philosophers",
    headers: ["Philosopher", "Year", "City", "Main ideas"],
    count: 0,
  },
];

export function closestMetaData(
  sheetSelection: SheetSelection,
  existing?: ResearchMetaData[]
) {
  if (!existing || existing.length === 0) {
    return {
      table: sheetSelection,
      prompt: "",
    };
  }
  let closest = existing[0];
  let closestDistance = Infinity;
  for (const meta of existing) {
    const distance =
      Math.abs(meta.table.start.row - sheetSelection.start.row) +
      Math.abs(meta.table.start.col - sheetSelection.start.col) +
      Math.abs(meta.table.end.row - sheetSelection.end.row) +
      Math.abs(meta.table.end.col - sheetSelection.end.col);
    if (distance < closestDistance) {
      closest = meta;
      closestDistance = distance;
    }
  }
  return closest;
}

function cellList(cells: ResearchCell[], cellRef: CellRef) {
  const gsMode = getGSheetAppConfig().inGSMode;
  let result = gsMode ? '=SUBSTITUTE(TEXTJOIN(", ", TRUE, ' : "=ai.sources(";
  for (let i = 0; i < cells.length; i++) {
    if (i > 0) {
      result += ", ";
    }
    if (gsMode) {
      result += 'CELL("address", ';
    }
    result += toA1(cells[i].col + cellRef.col, cells[i].row + cellRef.row);
    if (gsMode) {
      result += ")";
    }
  }
  result += ")";
  if (gsMode) {
    result += ', "$", "")';
  }
  return result;
}

const formatValue = (tableElementElement: any) => {
  if (typeof tableElementElement === "string") {
    return tableElementElement;
  } else if (typeof tableElementElement === "number") {
    return tableElementElement.toString();
  } else {
    return "";
  }
};

function emptyCell(cell: SimpleCell) {
  return cell.value === null || cell.value === "";
}

function findTableSize(grid: SimpleCell[][], col: number, row: number) {
  let maxRowWidth = 0;
  for (let row1 = row; row1 < grid.length; row1++) {
    if (emptyCell(grid[row1][col])) {
      return [maxRowWidth, row1 - row];
    }
    let rowWidth = 0;
    for (let col1 = col; col1 < grid[0].length; col1++) {
      if (emptyCell(grid[row1][col1])) {
        break;
      }
      rowWidth++;
    }
    maxRowWidth = Math.max(maxRowWidth, rowWidth);
  }
  return [maxRowWidth, grid.length - row];
}

export function extractResearchTableFromSheet(
  grid: SimpleCell[][],
  col: number,
  row: number,
  colCount?: number,
  rowCount?: number
) {
  const researchTable: ResearchTable = { table: [], sources: [] };
  if (grid[row][col].value === null || grid[row][col].value === "") {
    return researchTable;
  }
  let fixedRows = true;
  if (colCount === undefined || rowCount === undefined) {
    [colCount, rowCount] = findTableSize(grid, col, row);
    fixedRows = false;
  }
  const colHeaders = [];
  let headerDepth = 0;
  for (let row1 = row; row1 < row + rowCount; row1++) {
    headerDepth++;
    let done = false;
    let prevNonEmpty = "";
    for (let col1 = col; col1 < col + colCount; col1++) {
      if (!emptyCell(grid[row1][col1])) {
        prevNonEmpty = grid[row1][col1].value + "";
        if (col1 === col + colCount - 1) {
          done = true;
        }
      }
      if (row1 === row) {
        colHeaders.push(prevNonEmpty);
      } else {
        colHeaders[col1 - col] += "\\" + prevNonEmpty;
      }
    }
    if (done) {
      break;
    }
  }

  researchTable.table = [colHeaders];
  for (let row1 = row + headerDepth; row1 < row + rowCount; row1++) {
    if (
      !fixedRows &&
      (grid[row1][col].value === null ||
        grid[row1][col].value === "" ||
        grid[row1][col].value === SOURCES_LABEL)
    ) {
      break;
    }
    const rowValues = [];
    for (let col1 = col; col1 < col + colHeaders.length; col1++) {
      rowValues.push(grid[row1] ? grid[row1][col1].value : "");
    }
    researchTable.table.push(rowValues);
  }
  let collecting = false;
  for (let row2 = row + researchTable.table.length; row2 < grid.length; row2++) {
    if (collecting) {
      if (grid[row2][col].value === null || grid[row2][col].value === "") {
        break;
      }
      const a1Sources = (grid[row2][col + 2].value + "").match(/\w+\d+/g);
      const a1ToRowCol = (a1: string) => {
        const parsed = parseCellId(a1);
        if (!parsed || parsed.notebookCell) {
          return { row: -1, col: -1 };
        }
        return { row: parsed.y, col: parsed.x };
      };
      const cells = a1Sources ? a1Sources.map(a1ToRowCol) : [];
      researchTable.sources.push({
        title: grid[row2][col].value + "",
        url: grid[row2][col + 1].value + "",
        cells,
      });
    }
    if (grid[row2][col].value === SOURCES_LABEL) {
      collecting = true;
    }
  }
  return researchTable;
}

export function expandTableHeaders(table: (number | string | null)[][]) {
  if (table.length === 0) {
    return table;
  }
  const expandedHeaders = table[0].map((x) => (x + "").split("\\"));
  const transposed = expandedHeaders[0].map((_, col) =>
    expandedHeaders.map((row) => row[col])
  );
  const repeatedOmitted = transposed.map((row) => {
    const result = [];
    let prev = "";
    for (const cell of row) {
      if (cell === prev) {
        result.push("");
      } else {
        result.push(cell);
      }
      prev = cell;
    }
    return result;
  });
  return [...repeatedOmitted, ...table.splice(1)];
}

export function updateSheetWithResearchTable(
  item: ResearchTable,
  cellRef: CellRef,
  onUpdateCellValues: (updates: CellChangeWithRowCol[]) => void,
  sheetId: number
) {
  const updates: CellChangeWithRowCol[] = [];
  const table = expandTableHeaders(item.table);
  const usage = item.usage;
  const tableWidth = Math.max(table.length > 0 ? table[0].length : 0, 4);
  for (let row = 0; row < table.length; row++) {
    for (let col = 0; col < tableWidth; col++) {
      updates.push({
        col: cellRef.col + col,
        row: cellRef.row + row,
        value: formatValue(table[row][col]),
      });
    }
  }
  const tableEnd = cellRef.row + table.length;

  const sources = item.sources;
  if (sources.length) {
    for (let extra_rows = 0; extra_rows < sources.length + 7; extra_rows++) {
      const row = tableEnd + extra_rows;
      for (let col = 0; col < tableWidth; col++) {
        updates.push({
          col: cellRef.col + col,
          row: row,
          value: "",
        });
      }
      if (extra_rows === 1) {
        updates.push({
          col: cellRef.col,
          row: row,
          value: SOURCES_LABEL,
        });
      }
      if (extra_rows > 1 && extra_rows < sources.length + 2) {
        updates.push({
          col: cellRef.col,
          row: row,
          value: sources[extra_rows - 2].title,
        });
        updates.push({
          col: cellRef.col + 1,
          row: row,
          value: sources[extra_rows - 2].url,
        });
        updates.push({
          col: cellRef.col + 2,
          row: row,
          value: cellList(sources[extra_rows - 2].cells, cellRef),
        });
      }
      if (extra_rows === sources.length + 3) {
        updates.push({
          col: cellRef.col,
          row: row,
          value: "Usage:",
        });
      }
      if (
        usage &&
        (extra_rows === sources.length + 4 || extra_rows === sources.length + 5)
      ) {
        const values =
          extra_rows === sources.length + 4
            ? ["Running time", usage.runningTime, "Web searches", usage.webSearches]
            : [
                "AI Calls",
                usage.AICalls,
                "Tokens (000)",
                ((usage.promptTokens + usage.completionTokens) / 1000).toFixed(2),
              ];
        for (let col = 0; col < values.length; col++) {
          updates.push({
            col: cellRef.col + col,
            row: row,
            value: values[col] + "",
          });
        }
      }
    }
  }
  onUpdateCellValues(updates);
}

export function expandSelection(start: SheetLocation, grid: GridElement[][]) {
  const isEmpty = (row: number, col: number) => {
    if (row < 0 || col < 0 || row >= grid.length || col >= grid[0].length) {
      return true;
    }
    return grid[row][col].value === "" || grid[row][col].value === null;
  };

  const move = (dx: number, dy: number, point: SheetLocation): SheetLocation => {
    let { row, col } = point;
    while (!isEmpty(row + dy, col + dx)) {
      row += dy;
      col += dx;
    }
    return { row, col };
  };

  const up = move(0, -1, start);
  const down = move(0, 1, start);
  const left = move(-1, 0, up);
  const right = move(1, 0, up);

  return {
    start: { row: up.row, col: left.col },
    end: { row: down.row, col: right.col },
  };
}
