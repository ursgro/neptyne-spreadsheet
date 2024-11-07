import { SheetAttributes } from "../neptyne-container/NeptyneContainer";
import { SheetAttribute } from "../NeptyneProtocol";
import { sortBy, sortedIndex } from "lodash";

export const FIRST_COL_WIDTH = 50;
export const COLUMN_HEADER_HEIGHT = 20;
export const SCROLL_BAR_SIZE = 14;
export const ROW_MIN_HEIGHT = 15;
export const DEFAULT_CELL_HEIGHT = 20;
export const DEFAULT_CELL_WIDTH = 100;
export const COLUMN_MIN_WIDTH = 18;
export const FOOTER_HEIGHT = 30;
export const Z_INDEX_ABOVE_GRID = 2;
export const ROW_HEADER_WIDTH = 45;

export type NumberDict = { [key: number]: number };

export const getHiddenColHeaders = (sheetAttributes: SheetAttributes, max: number) =>
  (sheetAttributes.colsHiddenHeaders ?? []).filter((i: number) => i < max);

export const getHiddenRowHeaders = (sheetAttributes: SheetAttributes, max: number) =>
  (sheetAttributes.rowsHiddenHeaders ?? []).filter((i: number) => i < max);

export const getColSizes = (
  sheetAttributes: SheetAttributes,
  max: number
): NumberDict => {
  const sizesDict = sheetAttributes[SheetAttribute.ColsSizes] ?? {};
  return new Proxy(sizesDict, {
    get: (target, id) => (id in target ? target[id] : DEFAULT_CELL_WIDTH),
  });
};

export const getRowSizes = (
  sheetAttributes: SheetAttributes,
  max: number,
  overrides: NumberDict
): NumberDict => {
  const sizesDict = {
    ...overrides,
    ...(sheetAttributes[SheetAttribute.RowsSizes] ?? {}),
  };
  return new Proxy(sizesDict, {
    get: (target, id) => (id in target ? target[id] : DEFAULT_CELL_HEIGHT),
  });
};

export const visibleToGlobalIndex = (visibleIndex: number, hiddenHeaders: number[]) => {
  if (hiddenHeaders === undefined) {
    return visibleIndex;
  }
  const sortedHiddenHeaders = sortBy(hiddenHeaders);
  let i = 0;
  while (i < sortedHiddenHeaders.length && sortedHiddenHeaders[i] <= visibleIndex) {
    visibleIndex++;
    i++;
  }
  return visibleIndex;
};

export const globalToVisibleIndex = (
  globalIndex: number,
  hiddenHeaders: number[],
  bound?: number
) => {
  if (hiddenHeaders === undefined || hiddenHeaders.length === 0) {
    return globalIndex;
  }
  const sortedHiddenHeaders = sortBy(hiddenHeaders);
  const hiddenBefore = sortedIndex(sortedHiddenHeaders, globalIndex);
  const visibleIndex = globalIndex - hiddenBefore;
  if (bound !== undefined && bound < globalIndex) {
    return bound - hiddenHeaders.length;
  }
  return visibleIndex;
};

export const getHeaderSize = (
  offset: number,
  headerSizes: NumberDict,
  isRow: boolean
): number => {
  const default_size = isRow ? DEFAULT_CELL_HEIGHT : DEFAULT_CELL_WIDTH;
  return headerSizes[offset] ?? default_size;
};

export const getOffsetByPosition = (
  position: number,
  hiddenHeaders: number[],
  headerSizes: NumberDict,
  isRow: boolean
) => {
  let offset = 0;
  for (let i = 0; i < position; i++) {
    if (!hiddenHeaders || hiddenHeaders.includes(i)) {
      continue;
    }
    if (i in headerSizes) {
      offset += headerSizes[i] + 1; // +1 for the border
    } else {
      const size = isRow ? DEFAULT_CELL_HEIGHT : DEFAULT_CELL_WIDTH;
      offset += size + 1;
    }
  }
  return offset;
};
