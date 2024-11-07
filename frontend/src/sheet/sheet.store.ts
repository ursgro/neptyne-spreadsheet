import { makeAutoObservable } from "mobx";
import { GRID_WIDTH, GRID_HEIGHT } from "../neptyne-sheet/NeptyneSheet";
import { createGrid, GridElement } from "../SheetUtils";

export class SheetStore {
  sheet: GridElement[][] = createGrid(GRID_WIDTH, GRID_HEIGHT);

  constructor() {
    makeAutoObservable(this);
  }

  setSheet(sheet: GridElement[][]) {
    this.sheet = sheet;
  }
}

export const sheetStore = new SheetStore();
