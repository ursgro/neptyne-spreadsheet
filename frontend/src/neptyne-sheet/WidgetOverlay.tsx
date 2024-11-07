import {
  createContext,
  CSSProperties,
  FunctionComponent,
  memo,
  useCallback,
  useContext,
  useMemo,
} from "react";
import { AccessMode, CellAttribute, SheetUnawareCellId } from "../NeptyneProtocol";
import {
  GridElement,
  hasOverlappingWidget,
  isCellProtected,
  SheetUnawareCellAttributeUpdate,
} from "../SheetUtils";
import { getOffsetByPosition, NumberDict } from "./GridView";
import { PasteSpecial } from "./PasteSpecial/PasteSpecial";
import { OverlayPosition } from "./PasteSpecial/paste-special.store";
import { useAccessMode } from "../access-mode";

export const WidgetOverlayContext = createContext<{ row: number; col: number }>({
  row: 0,
  col: 0,
});

export const useWidgetOverlayContext = (): { row: number; col: number } => {
  const value = useContext(WidgetOverlayContext);
  if (!value) {
    throw new Error("useWidgetOverlayContext must be used within WidgetOverlayContext");
  }
  return value;
};

interface WidgetOverlayStaticContextValue {
  overlayPosition: OverlayPosition;
  frozenRowsCount: number;
  frozenColsCount: number;
  widgetCells: WidgetCell[];
  onSelect: (row: number, col: number) => void;
  onWidgetResize: (
    cell: GridElement,
    width: number,
    height: number,
    row: number,
    col: number
  ) => void;
}

/**
 * We need to pass some things to WidgetOverlay without actually calling it in our code.
 *
 * So we use this context to pass once-per-lifetime values, which will not be changed until the
 * grid is rerendered.
 */
export const WidgetOverlayStaticContext =
  createContext<WidgetOverlayStaticContextValue>({
    overlayPosition: "main",
    frozenRowsCount: 0,
    frozenColsCount: 0,
    widgetCells: [],
    onSelect: () => {},
    onWidgetResize: () => {},
  });

export const useWidgetOverlayStaticContext = (): WidgetOverlayStaticContextValue => {
  const value = useContext(WidgetOverlayStaticContext);
  if (!value) {
    throw new Error(
      "useWidgetOverlayStaticContext must be used within WidgetOverlayStaticContext"
    );
  }
  return value;
};

export interface WidgetCell {
  cell: GridElement;
  row: number;
  col: number;
  marginTop: number;
  marginLeft: number;
}

export interface WidgetOverlayCellProps extends WidgetCell {
  isCurrentCell: boolean;
  onSelect: (row: number, col: number) => void;
  onWidgetResize: (
    cell: GridElement,
    width: number,
    height: number,
    row: number,
    col: number
  ) => void;
}

export const WidgetOverlayCell: FunctionComponent<WidgetOverlayCellProps> = memo(
  ({
    cell,
    marginTop,
    marginLeft,
    row,
    col,
    isCurrentCell,
    onSelect,
    onWidgetResize,
  }) => {
    const Viewer = cell.valueViewer;
    const accessMode = useAccessMode();

    if (!Viewer) return null;
    const shouldHaveKey =
      !!cell.attributes?.[CellAttribute.RenderWidth] &&
      !!cell.attributes?.[CellAttribute.RenderHeight];

    return (
      <div
        style={{
          position: "absolute",
          top: marginTop,
          left: marginLeft,
        }}
      >
        <Viewer
          isReadOnly={accessMode !== AccessMode.Edit || isCellProtected(cell)}
          row={row}
          col={col}
          value={cell.value}
          cell={cell}
          isCurrentCell={isCurrentCell}
          onSelectCell={() => {
            onSelect(row, col);
          }}
          onWidgetResize={(width, height) =>
            onWidgetResize(cell, width, height, row, col)
          }
          {...(shouldHaveKey
            ? {
                key: `r${row}c${col}w${
                  cell.attributes?.[CellAttribute.RenderWidth] || 0
                }h${cell.attributes?.[CellAttribute.RenderHeight] || 0}`,
              }
            : {})}
        />
      </div>
    );
  }
);

const getWidgetCells = (
  grid: GridElement[][],
  hiddenRowHeaders: number[],
  hiddenColHeaders: number[],
  rowSizes: NumberDict,
  colSizes: NumberDict,
  frozenRowsCount: number,
  frozenColsCount: number
): [
  mainGrid: WidgetCell[],
  frozenRows: WidgetCell[],
  frozenCols: WidgetCell[],
  frozenCorner: WidgetCell[]
] => {
  const mainGrid: WidgetCell[] = [];
  const frozenRows: WidgetCell[] = [];
  const frozenCols: WidgetCell[] = [];
  const frozenCorner: WidgetCell[] = [];
  grid.forEach((row, rowIndex) =>
    row.forEach((cell, colIndex) => {
      if (!hasOverlappingWidget(cell)) return;

      const isFrozenRow = frozenRowsCount > rowIndex;
      const isFrozenCol = frozenColsCount > colIndex;

      let marginTop =
        getOffsetByPosition(rowIndex, hiddenRowHeaders, rowSizes, true) - rowIndex;
      let marginLeft =
        getOffsetByPosition(colIndex, hiddenColHeaders, colSizes, false) - colIndex + 5;

      const rowHeaderOffset = 75;
      const colHeaderOffset = 20;

      if (isFrozenRow) {
        marginTop += colHeaderOffset + 1;
      } else if (frozenRowsCount && !isFrozenRow) {
        marginTop =
          marginTop -
          getOffsetByPosition(frozenRowsCount, hiddenRowHeaders, rowSizes, true) +
          5;
      }

      if (isFrozenCol) {
        marginLeft += rowHeaderOffset;
      } else if (frozenColsCount && !isFrozenCol) {
        marginLeft =
          marginLeft -
          getOffsetByPosition(frozenColsCount, hiddenColHeaders, colSizes, false) +
          3;
      }

      const widgetCell = {
        cell,
        row: rowIndex,
        col: colIndex,
        marginTop,
        marginLeft,
      };

      if (isFrozenRow && isFrozenCol) {
        frozenCorner.push(widgetCell);
      } else if (isFrozenCol) {
        frozenCols.push(widgetCell);
      } else if (isFrozenRow) {
        frozenRows.push(widgetCell);
      } else {
        mainGrid.push(widgetCell);
      }
    })
  );

  return [mainGrid, frozenRows, frozenCols, frozenCorner];
};

export const WidgetOverlayList: FunctionComponent<{
  widgetCells: WidgetCell[];
  onSelectCell: (row: number, col: number) => void;
  onWidgetResize: (
    cell: GridElement,
    width: number,
    height: number,
    row: number,
    col: number
  ) => void;
}> = memo(({ widgetCells, onSelectCell, onWidgetResize }) => {
  const { row, col } = useWidgetOverlayContext();
  return (
    <>
      {widgetCells.map((widgetCell) => (
        <WidgetOverlayCell
          key={`${widgetCell.row}-${widgetCell.col}`}
          {...widgetCell}
          onSelect={onSelectCell}
          isCurrentCell={widgetCell.row === row && widgetCell.col === col}
          onWidgetResize={onWidgetResize}
        />
      ))}
    </>
  );
});

export const WidgetOverlayRenderer: FunctionComponent<{
  className: string;
  style: CSSProperties;
  children: React.ReactNode;
}> = memo(({ className, style, children }) => {
  const {
    widgetCells,
    frozenRowsCount,
    frozenColsCount,
    overlayPosition,
    onSelect,
    onWidgetResize,
  } = useWidgetOverlayStaticContext();
  return (
    <div className={className} style={style}>
      {children}
      <WidgetOverlayList
        widgetCells={widgetCells}
        onSelectCell={onSelect}
        onWidgetResize={onWidgetResize}
      />
      <PasteSpecial
        frozenRowsCount={frozenRowsCount}
        frozenColsCount={frozenColsCount}
        overlayPosition={overlayPosition}
      />
    </div>
  );
});

export const useWidgetOverlay = (
  grid: GridElement[][],
  hiddenRowHeaders: number[],
  hiddenColHeaders: number[],
  rowSizes: NumberDict,
  colSizes: NumberDict,
  onSelect: (row: number, col: number) => void,
  onCellAttributeChangeWrapper: (
    changes: SheetUnawareCellAttributeUpdate[],
    operationId?: string
  ) => void,
  frozenRowsCount: number,
  frozenColsCount: number
) => {
  const handleWidgetResize = useCallback(
    (cell: GridElement, width: number, height: number, row: number, col: number) => {
      if (cell.attributes) {
        const cellId: SheetUnawareCellId = [col, row];
        const changes: SheetUnawareCellAttributeUpdate[] = [
          {
            cellId,
            attribute: CellAttribute.RenderHeight,
            value: height.toString(),
          },
          {
            cellId,
            attribute: CellAttribute.RenderWidth,
            value: width.toString(),
          },
        ];
        onCellAttributeChangeWrapper(changes);
      }
    },
    [onCellAttributeChangeWrapper]
  );

  const [mainGridWidgets, frozenRowsWidgets, frozenColsWidgets, frozenCornerWidgets] =
    useMemo(
      () =>
        getWidgetCells(
          grid,
          hiddenRowHeaders,
          hiddenColHeaders,
          rowSizes,
          colSizes,
          frozenRowsCount,
          frozenColsCount
        ),
      [
        grid,
        hiddenRowHeaders,
        hiddenColHeaders,
        rowSizes,
        colSizes,
        frozenRowsCount,
        frozenColsCount,
      ]
    );

  const mainContextValue: WidgetOverlayStaticContextValue = useMemo(
    () => ({
      widgetCells: mainGridWidgets,
      onSelect,
      onWidgetResize: handleWidgetResize,
      overlayPosition: "main",
      frozenRowsCount,
      frozenColsCount,
    }),
    [handleWidgetResize, mainGridWidgets, onSelect, frozenRowsCount, frozenColsCount]
  );
  const frozenRowsContextValue: WidgetOverlayStaticContextValue = useMemo(
    () => ({
      widgetCells: frozenRowsWidgets,
      onSelect,
      onWidgetResize: handleWidgetResize,
      overlayPosition: "rows",
      frozenRowsCount,
      frozenColsCount,
    }),
    [frozenRowsWidgets, onSelect, handleWidgetResize, frozenRowsCount, frozenColsCount]
  );
  const frozenColsContextValue: WidgetOverlayStaticContextValue = useMemo(
    () => ({
      widgetCells: frozenColsWidgets,
      onSelect,
      onWidgetResize: handleWidgetResize,
      overlayPosition: "cols",
      frozenRowsCount,
      frozenColsCount,
    }),
    [frozenColsWidgets, onSelect, handleWidgetResize, frozenRowsCount, frozenColsCount]
  );
  const frozenCornerContextValue: WidgetOverlayStaticContextValue = useMemo(
    () => ({
      widgetCells: frozenCornerWidgets,
      onSelect,
      onWidgetResize: handleWidgetResize,
      overlayPosition: "corner",
      frozenRowsCount,
      frozenColsCount,
    }),
    [
      frozenCornerWidgets,
      handleWidgetResize,
      onSelect,
      frozenRowsCount,
      frozenColsCount,
    ]
  );

  return {
    mainContextValue,
    frozenRowsContextValue,
    frozenColsContextValue,
    frozenCornerContextValue,
  };
};
