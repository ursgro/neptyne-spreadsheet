import { makeAutoObservable } from "mobx";
import { SheetLocation, toA1 } from "../SheetUtils";

export class GridCache {
  mergeFirstCells: Record<string, SheetLocation> = {};
  overflowFirstCells: Record<string, SheetLocation> = {};

  constructor() {
    makeAutoObservable(this);
  }

  setFirstMergeCell(rootRow: number, rootCol: number, row: number, col: number) {
    this.mergeFirstCells[toA1(rootCol, rootRow)] = { row, col };
  }

  setFirstOverflowCell(rootRow: number, rootCol: number, row: number, col: number) {
    this.overflowFirstCells[toA1(rootCol, rootRow)] = { row, col };
  }

  clear() {
    this.mergeFirstCells = {};
    this.overflowFirstCells = {};
  }
}
