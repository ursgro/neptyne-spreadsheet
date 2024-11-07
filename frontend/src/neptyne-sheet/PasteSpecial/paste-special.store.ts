import { makeAutoObservable } from "mobx";
import { GridElement, SheetSelection } from "../../SheetUtils";
import { CLEARABLE_ATTRIBUTES, CellAttribute } from "../../NeptyneProtocol";
import { range } from "lodash";
import { createContext, useContext } from "react";

interface PasteSpecialPosition {
  x: number;
  y: number;
}

export enum PasteType {
  VALUE = "value",
  FORMAT = "format",
  ALL = "all",
}

export type OverlayPosition = "rows" | "cols" | "corner" | "main";

export class PasteSpecialStore {
  selection: SheetSelection | null = null;
  position: PasteSpecialPosition | null = null;
  originalCells: GridElement[][] | null = null;
  pastedCells: GridElement[][] | null = null;
  pasteTypes: PasteType[] = [];
  pasteHandler: ((cells: GridElement[][], selection: SheetSelection) => void) | null =
    null;

  constructor() {
    makeAutoObservable(this);
  }

  startPasteSpecial(
    position: PasteSpecialPosition,
    originalCells: GridElement[][],
    pastedCells: GridElement[][],
    selection: SheetSelection,
    pasteHandler: (cells: GridElement[][], selection: SheetSelection) => void
  ) {
    const pasteTypes = getPasteTypes(pastedCells);
    if (pasteTypes.length) {
      this.position = position;
      this.originalCells = originalCells;
      this.pastedCells = pastedCells;
      this.pasteTypes = pasteTypes;
      this.selection = selection;
      this.pasteHandler = pasteHandler;
    }
  }

  applyPasteSpecial(pasteType: PasteType) {
    const cells = getFusedCells(this.originalCells!, this.pastedCells!, pasteType);
    this.pasteHandler!(cells, this.selection!);
    this.endPasteSpecial();
  }

  endPasteSpecial() {
    this.position = null;
    this.originalCells = null;
    this.pastedCells = null;
    this.pasteTypes = [];
  }

  shouldRender(
    frozenRows: number,
    frozenCols: number,
    overlayPosition: OverlayPosition
  ): boolean {
    const { end } = this.selection!;
    if (end.col >= frozenCols && end.row >= frozenRows && overlayPosition === "main") {
      return true;
    }
    if (end.col >= frozenCols && end.row < frozenRows && overlayPosition === "rows") {
      return true;
    }
    if (end.col < frozenCols && end.row >= frozenRows && overlayPosition === "cols") {
      return true;
    }
    if (end.col < frozenCols && end.row < frozenRows && overlayPosition === "corner") {
      return true;
    }

    return false;
  }
}

export const pasteSpecialStore = new PasteSpecialStore();

export const PasteSpecialContext = createContext<PasteSpecialStore | null>(null);

export const usePasteSpecialContext = (): PasteSpecialStore => {
  const value = useContext(PasteSpecialContext);
  if (!value) {
    throw new Error("usePasteSpecialContext must be used within PasteSpecialContext");
  }
  return value;
};

const getPasteTypes = (pastedCells: GridElement[][]): PasteType[] =>
  pastedCells.some((row) =>
    row.some((cell) => !!cell.attributes && !!Object.keys(cell.attributes).length)
  )
    ? [PasteType.VALUE, PasteType.FORMAT, PasteType.ALL]
    : [];

const getFusedCells = (
  originalCells: GridElement[][],
  pastedCells: GridElement[][],
  pasteType: PasteType
): GridElement[][] => {
  const height = Math.max(originalCells.length, pastedCells.length);
  const width = Math.max(originalCells[0].length, pastedCells[0].length);

  return range(0, height).map((rowIdx) =>
    range(0, width).map((colIdx) =>
      getFusedCell(
        originalCells[rowIdx]?.[colIdx],
        pastedCells[rowIdx]?.[colIdx],
        pasteType
      )
    )
  );
};

const getFusedCell = (
  originalCell: GridElement | undefined,
  pastedCell: GridElement | undefined,
  pasteType: PasteType
): GridElement => {
  const value =
    (pasteType === PasteType.FORMAT ? originalCell?.value : pastedCell?.value) || "";
  const expression =
    (pasteType === PasteType.FORMAT
      ? originalCell?.expression
      : pasteType === PasteType.VALUE
      ? pastedCell?.value?.toString()
      : pastedCell?.expression) || "";
  const attributes = {
    ...getClearedAttributes([
      ...Object.keys(originalCell?.attributes || {}),
      ...Object.keys(pastedCell?.attributes || {}),
    ] as CellAttribute[]),
    ...((pasteType === PasteType.VALUE
      ? originalCell?.attributes
      : pastedCell?.attributes) || {}),
  };

  return {
    ...EMPTY_CELL,
    value,
    attributes,
    expression,
  };
};

const EMPTY_CELL = { value: null };

const getClearedAttributes = (attributeNames: CellAttribute[]) =>
  CLEARABLE_ATTRIBUTES.reduce(
    (attributes, attributeName) =>
      attributeNames.includes(attributeName)
        ? { ...attributes, [attributeName]: null }
        : attributes,
    {}
  );
