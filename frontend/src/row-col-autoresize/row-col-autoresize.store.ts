import { makeAutoObservable } from "mobx";
import { getCellId } from "../neptyne-container/gridUpdateUtils";
import { RemoteSheetCell } from "../neptyne-container/NeptyneContainer";
import {
  CellAttribute,
  Dimension,
  LineWrap,
  LineWrapDefault,
} from "../NeptyneProtocol";
import { GridElement, parseCellId, ParsedSheetCell } from "../SheetUtils";
import { NumberDict } from "../neptyne-sheet/GridView";

export class RowColAutoresizeStore {
  resizeDimension?: Dimension;
  resizeIndices?: number[];
  isClientResize?: boolean;
  clientRowSizes: NumberDict = {};

  constructor() {
    makeAutoObservable(this);
  }

  startClientResizeFromRowIds(rowIds: number[]) {
    this.startResize(
      Dimension.Row,
      rowIds.concat(Object.keys(this.clientRowSizes).map(Number)),
      true
    );
  }

  startFullClientResize(grid: GridElement[][]) {
    this.startResize(
      Dimension.Row,
      gridToRowIndices(grid).concat(Object.keys(this.clientRowSizes).map(Number)),
      true
    );
  }

  startResize(dimension: Dimension, ids: number[], isClientResize: boolean) {
    this.resizeDimension = dimension;
    this.resizeIndices = [...new Set(ids)];
    this.isClientResize = isClientResize;
  }

  finishResize() {
    this.resizeDimension = undefined;
    this.resizeIndices = [];
    this.isClientResize = undefined;
  }

  setClientRowSizes(sizes: NumberDict) {
    this.clientRowSizes = sizes;
  }
}

export const rowColAutoresizeStore = new RowColAutoresizeStore();

export const cellUpdatesToRowIndices = (
  cellUpdates: RemoteSheetCell[],
  grid: GridElement[][]
): number[] =>
  cellUpdates
    .map((cellUpdate) => {
      const { notebookCell, x, y } = parseCellId(
        getCellId(cellUpdate)
      ) as ParsedSheetCell;

      return !notebookCell && shouldResizeCell(grid[y]?.[x]) ? y : null;
    })
    .filter((y) => y !== null) as number[];

const gridToRowIndices = (grid: GridElement[][]): number[] =>
  grid
    .map((row, idx) => ({ row, idx }))
    .filter(({ row }) => row.some((cell) => shouldResizeCell(cell)))
    .map(({ idx }) => idx);

export const shouldResizeCell = (cell?: GridElement) => {
  if (!cell || (!cell.value && cell.value !== 0)) {
    return false;
  }

  const lineWrap = cell.attributes?.[CellAttribute.LineWrap] || LineWrapDefault;
  if (lineWrap === LineWrap.Wrap) {
    return true;
  }

  return cell.value.toString().includes("\n");
};
