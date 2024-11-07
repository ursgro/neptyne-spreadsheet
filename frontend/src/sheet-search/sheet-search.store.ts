import { makeAutoObservable } from "mobx";
import { createContext, RefObject, useContext } from "react";
import { GridElement } from "../SheetUtils";

export class SheetSearchStore {
  searchQuery = "";
  isPanelOpen = false;
  searchMatches: Set<string> = new Set();
  selectedMatchIdx: number | null = null;
  searchInputRef: RefObject<HTMLInputElement> | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  startSearch() {
    this.isPanelOpen = true;
    this.searchInputRef?.current?.focus();
    this.searchInputRef?.current?.select();
  }

  setSearchInputRef(searchInputRef: RefObject<HTMLInputElement> | null) {
    this.searchInputRef = searchInputRef;
  }

  endSearch() {
    this.searchQuery = "";
    this.searchMatches = new Set();
    this.isPanelOpen = false;
    this.setSelectedMatchIdx(null);
    this.setSearchInputRef(null);
  }

  setSearchQuery(searchQuery: string, grid: GridElement[][]) {
    this.searchQuery = searchQuery;
    const searchQueryLower = searchQuery.toLowerCase();
    const isMatch = (value: string | null) =>
      value?.toLowerCase().includes(searchQueryLower);

    const searchMatches = new Set(
      searchQuery
        ? grid.flatMap(
            (row, rowIdx) =>
              row
                .map(({ expression, value }, colIdx) =>
                  isMatch(expression) || (value && isMatch(value.toString()))
                    ? `${rowIdx}-${colIdx}`
                    : null
                )
                .filter((value) => !!value) as string[]
          )
        : []
    );
    this.searchMatches = searchMatches;
    this.setSelectedMatchIdx(searchMatches.size ? 0 : null);
  }

  setSelectedMatchIdx(idx: number | null) {
    this.selectedMatchIdx = idx;
  }

  setNextSelectedMatchIdx() {
    if (this.searchMatches.size === 0) return;
    if (
      this.selectedMatchIdx == null ||
      this.selectedMatchIdx + 1 >= this.searchMatches.size
    ) {
      this.setSelectedMatchIdx(0);
    } else {
      this.setSelectedMatchIdx(this.selectedMatchIdx + 1);
    }
  }

  setPrevSelectedMatchIdx() {
    if (this.searchMatches.size === 0) return;
    if (this.selectedMatchIdx == null || this.selectedMatchIdx === 0) {
      this.setSelectedMatchIdx(this.searchMatches.size - 1);
    } else {
      this.setSelectedMatchIdx(this.selectedMatchIdx - 1);
    }
  }

  get currentPosition(): { row: number; col: number } | undefined {
    if (this.selectedMatchIdx !== null) {
      return keyToCoords([...this.searchMatches.values()][this.selectedMatchIdx]);
    }
    return undefined;
  }
}

const keyToCoords = (key: string): { row: number; col: number } => {
  try {
    const [row, col] = key.split("-");
    return { row: parseInt(row), col: parseInt(col) };
  } catch (e) {
    throw new Error(`Could not parse row/col from ${key}`);
  }
};

export const sheetSearchStore = new SheetSearchStore();

export const SheetSearchContext = createContext<SheetSearchStore | null>(null);

export const useSheetSearchContext = (): SheetSearchStore => {
  const value = useContext(SheetSearchContext);
  if (!value) {
    throw new Error("useSheetSearchContext must be used within SheetSearchContext");
  }
  return value;
};
