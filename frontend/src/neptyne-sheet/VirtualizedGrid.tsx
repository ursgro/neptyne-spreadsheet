import {
  areEqual,
  GridChildComponentProps,
  GridOnScrollProps,
  VariableSizeGrid,
} from "react-window";
import {
  CSSProperties,
  FunctionComponent,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ReactWindowCellRenderer } from "./react-window-cell/ReactWindowCellRenderer";
import { NeptyneSheetContextValue } from "./NeptyneSheet";
import {
  GridElement,
  SelectionRectangle,
  SheetSelection,
  SheetUnawareCellAttributeUpdate,
} from "../SheetUtils";
import { NeptyneSheetRendererProps } from "./NeptyneSheetRenderer";
import { GridScrollBar } from "./GridScrollBar";
import { isMobile } from "react-device-detect";
import {
  useWidgetOverlay,
  WidgetOverlayContext,
  WidgetOverlayRenderer,
  WidgetOverlayStaticContext,
} from "./WidgetOverlay";
import { GridCache } from "./grid-cache.store";
import { observer } from "mobx-react-lite";
import { globalToVisibleIndex, NumberDict, ROW_HEADER_WIDTH } from "./GridView";

export interface GridData
  extends Omit<
      NeptyneSheetContextValue,
      | "virtualSelection"
      | "activeCell"
      | "globalActiveCellLocation"
      | "onCellAttributeChange"
      | "sheetAttributes"
      | "width"
      | "height"
    >,
    NeptyneSheetRendererProps {
  hiddenRowHeaders: number[];
  hiddenColHeaders: number[];
  rowSizes: NumberDict;
  colSizes: NumberDict;
  grid: GridElement[][];
  selectionRect: SelectionRectangle;
  dependsOn: SheetSelection[];
  searchMatches: Set<string>;
  currentSearchPosition: { row: number; col: number } | undefined;
  isOneCellSelected: boolean;
  areGridlinesHidden?: boolean;
  onCellAttributeChangeWrapper: (
    changes: SheetUnawareCellAttributeUpdate[],
    operationId?: string
  ) => void;
  gridCache: GridCache;
  getColumnWidth: (idx: number) => number;
  getRowHeight: (idx: number) => number;
}

interface Properties {
  className?: string;
  columnWidth: (index: number) => number;
  rowHeight: (index: number) => number;
  columnCount: number;
  rowCount: number;
  width: number;
  height: number;

  frozenRowCount: number;
  frozenColumnCount: number;

  gridData: Omit<GridData, "gridCache">;
  hideScrollbars?: boolean;
  hideHeaders?: boolean;
}

interface OffsetCellRendererProps extends GridChildComponentProps {
  rowOffset: number;
  colOffset: number;
}

const HORIZONTAL_TABLE_BLOCK_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "row",
};

const OffsetCellRenderer: FunctionComponent<OffsetCellRendererProps> = memo(
  ({ rowOffset, colOffset, ...props }) => (
    <ReactWindowCellRenderer
      {...props}
      columnIndex={props.columnIndex + colOffset}
      rowIndex={props.rowIndex + rowOffset}
    />
  ),
  areEqual
);

const gridComponentStyle = isMobile
  ? {}
  : {
      display: "flex",
    };

export const VirtualizedGrid = observer((props: Properties) => {
  const {
    frozenRowCount: frozenRowCountProp,
    frozenColumnCount: frozenColumnCountProp,
    gridData,
    className,
    hideHeaders,
  } = props;
  const {
    grid,
    hiddenRowHeaders,
    hiddenColHeaders,
    rowSizes,
    colSizes,
    editingCell,
    onCellAttributeChangeWrapper,
    onSelectCell,
  } = gridData;

  const {
    mainContextValue,
    frozenColsContextValue,
    frozenRowsContextValue,
    frozenCornerContextValue,
  } = useWidgetOverlay(
    grid,
    hiddenRowHeaders,
    hiddenColHeaders,
    rowSizes,
    colSizes,
    onSelectCell,
    onCellAttributeChangeWrapper,
    frozenRowCountProp - 1,
    frozenColumnCountProp - 1
  );

  const frozenRowCount = useMemo(
    () =>
      frozenRowCountProp -
      (hiddenRowHeaders ?? []).filter((globalIndex) => frozenRowCountProp > globalIndex)
        .length,
    [frozenRowCountProp, hiddenRowHeaders]
  );
  const frozenColumnCount = useMemo(
    () =>
      frozenColumnCountProp -
      (hiddenColHeaders ?? []).filter(
        (globalIndex) => frozenColumnCountProp > globalIndex
      ).length,
    [frozenColumnCountProp, hiddenColHeaders]
  );

  const { rowHeight, columnWidth } = props;

  const cornerRef = useRef<VariableSizeGrid>(null);
  const topHeaderRef = useRef<VariableSizeGrid>(null);
  const leftHeaderRef = useRef<VariableSizeGrid>(null);
  const mainGridRef = useRef<VariableSizeGrid>(null);

  const mainGridContainerRef = useRef<HTMLDivElement>(null);
  const outerContainerRef = useRef<HTMLDivElement>(null);
  const shouldScroll = useRef(false);

  const [verticalScrollOffset, setVerticalScrollOffset] = useState(0);
  const [horizontalScrollOffset, setHorizontalScrollOffset] = useState(0);

  const gridCache = useMemo(() => new GridCache(), []);

  useEffect(() => {
    gridCache.clear();
  }, [grid, gridCache]);

  const activeRow = props.gridData?.sheetSelection.end.row;
  const activeCol = props.gridData?.sheetSelection.end.col;
  const selectionStartRow = props.gridData?.sheetSelection.start.row;
  const selectionStartCol = props.gridData?.sheetSelection.start.col;

  const handleScrollToCell = useCallback(
    (
      globalRow: number,
      globalCol: number,
      startRow: number,
      startCol: number,
      rowCount: number,
      colCont: number,
      frozenRowCount: number,
      frozenColCount: number,
      hiddenRowHeaders: number[],
      hiddenColHeaders: number[]
    ) => {
      const row = globalToVisibleIndex(globalRow, hiddenRowHeaders);
      const col = globalToVisibleIndex(globalCol, hiddenColHeaders);

      if (
        // Do not scroll if we've selected an entire row or column
        row - startRow === rowCount - 2 ||
        col - startCol === colCont - 2
      ) {
        return;
      }

      // if we call topHeaderRef.scrollToItem and leftHeaderRef.scrollToItem, there is a
      // tiny yet visible misalignment among them. So instead we have to catch scroll event and
      // adjust other grids manually by pixel offset.
      mainGridRef.current?.scrollToItem({
        // subtract headers
        rowIndex: row - (frozenRowCount - 1),
        columnIndex: col - (frozenColCount - 1),
      });
      shouldScroll.current = true;
      gridCache.clear();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    if (activeRow !== undefined && activeCol !== undefined) {
      handleScrollToCell(
        activeRow,
        activeCol,
        selectionStartRow,
        selectionStartCol,
        props.rowCount,
        props.columnCount,
        frozenRowCount,
        frozenColumnCount,
        hiddenRowHeaders,
        hiddenColHeaders
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRow, activeCol, handleScrollToCell]);

  useEffect(() => {
    if (
      !!editingCell &&
      editingCell.row !== undefined &&
      editingCell.col !== undefined
    ) {
      handleScrollToCell(
        editingCell.row,
        editingCell.col,
        selectionStartRow,
        selectionStartCol,
        props.rowCount,
        props.columnCount,
        frozenRowCount,
        frozenColumnCount,
        hiddenRowHeaders,
        hiddenColHeaders
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingCell, handleScrollToCell]);

  useEffect(
    () => {
      const { current: grid } = mainGridRef;
      const { current: top } = topHeaderRef;
      const { current: left } = leftHeaderRef;
      if (grid && top && left) {
        grid.scrollTo({ scrollLeft: 0, scrollTop: 0 });
        top.scrollTo({ scrollLeft: 0 });
        left.scrollTo({ scrollTop: 0 });
      }
    },
    [] /* only on initial render, make sure we're at grid origin */
  );

  const handleScroll = useCallback(({ scrollLeft, scrollTop }: GridOnScrollProps) => {
    if (shouldScroll.current) {
      topHeaderRef.current?.scrollTo({ scrollLeft });
      leftHeaderRef.current?.scrollTo({ scrollTop });
      shouldScroll.current = false;
    }
    setVerticalScrollOffset(scrollTop);
    setHorizontalScrollOffset(scrollLeft);
    if (isMobile) {
      setTimeout(() => {
        topHeaderRef.current?.scrollTo({ scrollLeft });
        leftHeaderRef.current?.scrollTo({ scrollTop });
      });
    }
  }, []);

  const frozenRowHeight = useMemo(() => {
    let height = 0;
    for (let i = 0; i < frozenRowCount; i++) {
      height += rowHeight(i);
    }
    return height;
  }, [frozenRowCount, rowHeight]);
  const frozenColWidth = useMemo(() => {
    let width = 0;
    for (let i = 0; i < frozenColumnCount; i++) {
      width += columnWidth(i);
    }
    return width;
  }, [columnWidth, frozenColumnCount]);

  const unfrozenHeight = props.height - frozenRowHeight;
  const unfrozenWidth = props.width - frozenColWidth;

  const cornerGridStyle = useMemo(
    (): CSSProperties => ({
      ...gridComponentStyle,
      ...(frozenColumnCount > 1 ? { borderRight: "2px solid gray" } : {}),
      ...(frozenRowCount > 1 ? { borderBottom: "2px solid gray" } : {}),
      ...(isMobile ? { overflow: "hidden" } : {}),
    }),
    [frozenColumnCount, frozenRowCount]
  );

  const topGridStyle = useMemo(
    (): CSSProperties => ({
      ...gridComponentStyle,
      ...(frozenRowCount > 1 ? { borderBottom: "2px solid gray" } : {}),
      ...(isMobile ? { overflowY: "hidden" } : {}),
    }),
    [frozenRowCount]
  );

  const leftGridStyle = useMemo(
    (): CSSProperties => ({
      ...gridComponentStyle,
      ...(frozenColumnCount > 1 ? { borderRight: "2px solid gray" } : {}),
      ...(isMobile ? { overflowX: "hidden" } : {}),
    }),
    [frozenColumnCount]
  );

  useEffect(() => {
    const { current: corner } = cornerRef;
    const { current: grid } = mainGridRef;
    const { current: top } = topHeaderRef;
    const { current: left } = leftHeaderRef;
    [corner, grid, top, left].forEach((grid) => {
      grid?.resetAfterIndices({ columnIndex: 0, rowIndex: 0 });
    });
  });

  const offsetColumnWidth = useCallback(
    (index: number) => columnWidth(index + frozenColumnCount),
    [columnWidth, frozenColumnCount]
  );
  const offsetRowHeight = useCallback(
    (index: number) => rowHeight(index + frozenRowCount),
    [frozenRowCount, rowHeight]
  );

  const FrozenCornerRenderer = useCallback(
    (props: GridChildComponentProps) => (
      <OffsetCellRenderer {...props} colOffset={0} rowOffset={0} />
    ),
    []
  );

  const FrozenRowRenderer = useCallback(
    (props: GridChildComponentProps) => (
      <OffsetCellRenderer {...props} colOffset={frozenColumnCount} rowOffset={0} />
    ),
    [frozenColumnCount]
  );

  const FrozenColumnRenderer = useCallback(
    (props: GridChildComponentProps) => (
      <OffsetCellRenderer {...props} colOffset={0} rowOffset={frozenRowCount} />
    ),
    [frozenRowCount]
  );

  const FrozenCellRenderer = useCallback(
    (props: GridChildComponentProps) => (
      <OffsetCellRenderer
        {...props}
        colOffset={frozenColumnCount}
        rowOffset={frozenRowCount}
      />
    ),
    [frozenColumnCount, frozenRowCount]
  );

  const handleVerticalScrollbarScroll = useCallback((position: number) => {
    setVerticalScrollOffset(position);
    mainGridRef.current?.scrollTo({ scrollTop: position });
    leftHeaderRef.current?.scrollTo({ scrollTop: position });
  }, []);

  const handleHorizontalScrollbarScroll = useCallback((position: number) => {
    setHorizontalScrollOffset(position);
    mainGridRef.current?.scrollTo({ scrollLeft: position });
    topHeaderRef.current?.scrollTo({ scrollLeft: position });
  }, []);

  const handleVerticalScroll = useCallback(({ scrollTop }: GridOnScrollProps) => {
    mainGridRef.current?.scrollTo({ scrollTop });
  }, []);

  const handleHorizontalScroll = useCallback(({ scrollLeft }: GridOnScrollProps) => {
    mainGridRef.current?.scrollTo({ scrollLeft });
  }, []);

  const outerGridStyle = isMobile ? {} : { width: "100%", height: "100%" };

  const ctxValue = useMemo(
    () => ({
      row: gridData.activeCellLocation.row,
      col: gridData.activeCellLocation.col,
    }),
    [gridData.activeCellLocation.row, gridData.activeCellLocation.col]
  );

  const [gridHeight, gridWidth] = useMemo(() => {
    let height = 0;
    let width = 0;
    for (let i = 0; i < props.rowCount; i++) {
      height += rowHeight(i);
    }
    for (let i = 0; i < props.columnCount; i++) {
      width += columnWidth(i);
    }
    return [height, width];
  }, [columnWidth, rowHeight, props.columnCount, props.rowCount]);

  const maxVScroll = gridHeight - frozenRowHeight - unfrozenHeight;
  const maxHScroll = gridWidth - frozenColWidth - unfrozenWidth;

  useEffect(() => {
    const { current: outerGrid } = outerContainerRef;
    if (outerGrid && !isMobile) {
      const handler = (e: WheelEvent) => {
        e.preventDefault();
        const { deltaX, deltaY } = e;
        const { current: grid } = mainGridRef;
        const { current: top } = topHeaderRef;
        const { current: left } = leftHeaderRef;
        const { current: gridDiv } = mainGridContainerRef;
        if (gridDiv && grid && top && left) {
          let { scrollLeft, scrollTop } = gridDiv;
          scrollLeft += deltaX;
          scrollTop += deltaY;
          if (scrollLeft > maxHScroll) {
            scrollLeft = maxHScroll;
          }
          if (scrollTop > maxVScroll) {
            scrollTop = maxVScroll;
          }
          grid.scrollTo({ scrollLeft, scrollTop });
          top.scrollTo({ scrollLeft });
          left.scrollTo({ scrollTop });
          gridCache.clear();
        }
      };
      outerGrid.addEventListener("wheel", handler);
      return () => outerGrid.removeEventListener("wheel", handler);
    }
  });

  const gridDataWithCache = useMemo(
    () => ({
      ...gridData,
      gridCache,
    }),
    [gridData, gridCache]
  );

  const unfrozenHorizontalDivStyles = useMemo(
    (): CSSProperties => ({ position: "absolute", left: frozenColWidth, top: 0 }),
    [frozenColWidth]
  );
  const mainGridInnerContainerStyles = useMemo(
    (): CSSProperties => ({
      position: "absolute",
      left: frozenColWidth,
      top: frozenRowHeight,
    }),
    [frozenColWidth, frozenRowHeight]
  );

  return (
    <WidgetOverlayContext.Provider value={ctxValue}>
      <div
        id="outer-grid-container"
        ref={outerContainerRef}
        className={className}
        style={outerGridStyle}
      >
        {!hideHeaders && (
          <div style={HORIZONTAL_TABLE_BLOCK_STYLE}>
            {/* TODO: this corner is never scrollable, and so doesn't really need to be a virtualized grid*/}
            <WidgetOverlayStaticContext.Provider value={frozenCornerContextValue}>
              <VariableSizeGrid
                innerElementType={WidgetOverlayRenderer}
                ref={cornerRef}
                style={cornerGridStyle}
                height={frozenRowHeight}
                width={frozenColWidth}
                columnCount={frozenColumnCount}
                rowCount={frozenRowCount}
                columnWidth={columnWidth}
                rowHeight={rowHeight}
                itemData={gridDataWithCache}
                className="scrollable-grid"
              >
                {FrozenCornerRenderer}
              </VariableSizeGrid>
            </WidgetOverlayStaticContext.Provider>
            <div style={unfrozenHorizontalDivStyles}>
              <WidgetOverlayStaticContext.Provider value={frozenRowsContextValue}>
                <VariableSizeGrid
                  innerElementType={WidgetOverlayRenderer}
                  ref={topHeaderRef}
                  style={topGridStyle}
                  height={frozenRowHeight}
                  width={unfrozenWidth}
                  onScroll={handleHorizontalScroll}
                  columnCount={props.columnCount - frozenColumnCount}
                  rowCount={frozenRowCount}
                  columnWidth={offsetColumnWidth}
                  rowHeight={rowHeight}
                  itemData={gridDataWithCache}
                  className="scrollable-grid"
                >
                  {FrozenRowRenderer}
                </VariableSizeGrid>
              </WidgetOverlayStaticContext.Provider>
            </div>
          </div>
        )}
        <div style={HORIZONTAL_TABLE_BLOCK_STYLE}>
          {!hideHeaders && (
            <WidgetOverlayStaticContext.Provider value={frozenColsContextValue}>
              <VariableSizeGrid
                innerElementType={WidgetOverlayRenderer}
                ref={leftHeaderRef}
                style={leftGridStyle}
                height={unfrozenHeight}
                width={frozenColWidth}
                onScroll={handleVerticalScroll}
                columnCount={frozenColumnCount}
                rowCount={props.rowCount - frozenRowCount}
                columnWidth={columnWidth}
                rowHeight={offsetRowHeight}
                itemData={gridDataWithCache}
                className="scrollable-grid"
              >
                {FrozenColumnRenderer}
              </VariableSizeGrid>
            </WidgetOverlayStaticContext.Provider>
          )}
          <div id="main-grid-container">
            <div style={mainGridInnerContainerStyles}>
              <WidgetOverlayStaticContext.Provider value={mainContextValue}>
                <VariableSizeGrid
                  innerElementType={WidgetOverlayRenderer}
                  ref={mainGridRef}
                  style={gridComponentStyle}
                  outerRef={mainGridContainerRef}
                  width={unfrozenWidth}
                  height={unfrozenHeight}
                  columnWidth={offsetColumnWidth}
                  rowHeight={offsetRowHeight}
                  itemData={gridDataWithCache}
                  onScroll={handleScroll}
                  rowCount={props.rowCount - frozenRowCount}
                  columnCount={props.columnCount - frozenColumnCount}
                  className="scrollable-grid"
                >
                  {FrozenCellRenderer}
                </VariableSizeGrid>
              </WidgetOverlayStaticContext.Provider>
            </div>
            {!props.hideScrollbars && (
              <>
                <GridScrollBar
                  headerSizes={rowSizes}
                  scrollOffset={verticalScrollOffset}
                  onScroll={handleVerticalScrollbarScroll}
                  orientation="vertical"
                  contentSize={gridHeight - frozenRowHeight}
                  frozenHeadersSize={frozenRowHeight - rowHeight(0)}
                />
                <GridScrollBar
                  headerSizes={colSizes}
                  scrollOffset={horizontalScrollOffset}
                  onScroll={handleHorizontalScrollbarScroll}
                  orientation="horizontal"
                  offsetLeft={ROW_HEADER_WIDTH}
                  contentSize={gridWidth - frozenColWidth}
                  frozenHeadersSize={frozenColWidth - columnWidth(0)}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </WidgetOverlayContext.Provider>
  );
});
