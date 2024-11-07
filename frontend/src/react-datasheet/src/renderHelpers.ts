import { GridElement } from "../../SheetUtils";

export function renderValue(cell: GridElement) {
  const value = cell.value;
  return value === null || typeof value === "undefined" ? "" : value;
}

export function renderData(cell: GridElement) {
  const value = cell.expression;
  return value === null || typeof value === "undefined" ? renderValue(cell) : value;
}
