import { camelCase } from "lodash";
import { CSSProperties, FunctionComponent } from "react";
import { GridChildComponentProps } from "react-window";
import DataCell from "../../react-datasheet/src/DataCell";
import range from "lodash/range";
import {
  isCellProtected,
  isFormulaValue,
  isInSelection as checkInSelection,
  isInSelection,
  selectionToRect,
  SheetSelection,
  toA1,
  GridElement,
} from "../../SheetUtils";
import { GridData } from "../VirtualizedGrid";
import { getRootCellCoords } from "../../merge-cells";
import { observer } from "mobx-react-lite";
import { GridCache } from "../grid-cache.store";
import { visibleToGlobalIndex } from "../GridView";
import { useAccessMode } from "../../access-mode";
import { AccessMode } from "../../NeptyneProtocol";

function getSelectionBordersProps(
  row: number,
  col: number,
  selection: SheetSelection | null | undefined,
  placeholder: string
): Record<string, boolean> {
  if (selection === null || selection === undefined) {
    return {};
  }

  const { top, bottom, left, right } = selectionToRect(selection);

  if (row !== top && row !== bottom && col !== left && col !== right) {
    return {};
  }
  const cellIsInSelection = isInSelection({ top, bottom, right, left }, row, col);

  return Object.fromEntries(
    [
      ["top", top === row],
      ["bottom", bottom === row],
      ["left", left === col],
      ["right", right === col],
    ].map(([key, value]) => [
      camelCase(`has_${key}_${placeholder}_border`),
      Boolean(cellIsInSelection && value),
    ])
  );
}

interface NeptyneCellRendererProps
  extends Omit<GridChildComponentProps<GridData>, "columnIndex" | "rowIndex"> {
  cellKey: string;
  row: number;
  col: number;
}

export const NeptyneCellRenderer: FunctionComponent<NeptyneCellRendererProps> =
  observer(
    ({ row: rowProps, col: colProps, style: styleProps, data, cellKey: key }) => {
      const globalRowIndex = visibleToGlobalIndex(rowProps, data.hiddenRowHeaders);
      const globalColIndex = visibleToGlobalIndex(colProps, data.hiddenColHeaders);
      const rootCell = getRootCell(
        data.grid,
        styleProps,
        rowProps,
        colProps,
        globalRowIndex,
        globalColIndex,
        data.getRowHeight,
        data.getColumnWidth,
        data.gridCache
      );
      const accessMode = useAccessMode();

      if (!rootCell || !rootCell.cell) {
        return null;
      }

      const { cell, row, col, style } = rootCell;

      const isEditing = data.editingCell.row === row && data.editingCell.col === col;
      const isClearing = data.clearingCell.row === row && data.clearingCell.col === col;
      const isCurrentCell =
        data.activeCellLocation.row === row && data.activeCellLocation.col === col;
      const isCodeCell = isFormulaValue(cell.expression || "");
      const isInSelection = checkInSelection(data.selectionRect, row, col);

      let highlightColorIdx = undefined;
      for (let i = 0; i < data.dependsOn.length; i++) {
        const selection = data.dependsOn[i];
        if (
          selection.start.row <= row &&
          row < selection.end.row &&
          selection.start.col <= col &&
          col < selection.end.col
        ) {
          highlightColorIdx = i;
          break;
        }
      }

      const hasAutoFillDragControl =
        accessMode === AccessMode.Edit &&
        !isEditing &&
        data.selectionRect.bottom === row &&
        data.selectionRect.right === col;
      const autoFillSelectionBordersProps = getSelectionBordersProps(
        row,
        col,
        data.autofillSelection,
        "autoFill"
      ) as {
        hasTopAutoFillBorder: boolean;
        hasRightAutoFillBorder: boolean;
        hasBottomAutoFillBorder: boolean;
        hasLeftAutoFillBorder: boolean;
      };
      const cutSelectionBordersProps = getSelectionBordersProps(
        row,
        col,
        data.cutSelection,
        "cut"
      ) as {
        hasTopCutBorder: boolean;
        hasRightCutBorder: boolean;
        hasBottomCutBorder: boolean;
        hasLeftCutBorder: boolean;
      };

      const copyFormatBordersProps = getSelectionBordersProps(
        row,
        col,
        data.copyFormatSource,
        "copy_format"
      );

      return (
        <DataCell
          key={key}
          row={row}
          col={col}
          testId={`cell-${row}-${col}`}
          cell={cell}
          style={style}
          activeRow={isEditing ? data.activeCellLocation.row : undefined}
          activeColumn={isEditing ? data.activeCellLocation.col : undefined}
          currentCellValue={cell.value}
          isSelectingWhileEditing={isEditing ? data.isSelectingWhileEditing : false}
          isSearchHighlighted={data.searchMatches.has(`${row}-${col}`)}
          isSearchSelected={
            row === data.currentSearchPosition?.row &&
            globalColIndex === data.currentSearchPosition?.col
          }
          isEditMode={isEditing ? data.editMode : false}
          isForcedEdit={
            isEditing &&
            (data.isSelectingWhileEditing || isCurrentCell) &&
            data.isForcedEdit
          }
          isEditingFromTopEditor={isEditing && data.isEditingFromTopEditor}
          isCurrentCell={isCurrentCell}
          isTheOnlyCellSelected={isInSelection && data.isOneCellSelected}
          isInSelection={isInSelection}
          isCodeCell={isCodeCell}
          highlightColorIdx={highlightColorIdx}
          isReadOnly={data.readOnly || isCellProtected(cell)}
          isFrozenRowBound={false}
          isFrozenColBound={false}
          areGridlinesHidden={data.areGridlinesHidden}
          isOverflown={rootCell.isOverflown}
          {...autoFillSelectionBordersProps}
          {...cutSelectionBordersProps}
          {...copyFormatBordersProps}
          editing={isEditing}
          clearing={isClearing}
          hasAutoFillDragControl={hasAutoFillDragControl}
          callServerMethod={data.callServerMethod}
          onWidgetChange={data.onWidgetChange}
          onAutofillDragStart={data.onAutofillDragStart}
          onAutofillCellMove={data.onAutofillCellMove}
          onAutofillDragStop={data.onAutofillDragStop}
          onMouseDown={data.onMouseDown}
          onSelectCell={data.onSelectCell}
          onMouseOver={data.onMouseOver}
          onDoubleClick={data.onDoubleClick}
          onContextMenu={data.onContextMenu}
          onChange={data.onChange}
          onFinishEditing={data.onFinishEditing}
          onNavigate={data.onNavigate}
          onUpdateCellValues={data.onUpdateCellValues}
          getAutocomplete={data.getAutocomplete}
          onCellAttributeChange={data.onCellAttributeChangeWrapper}
          onDataEditorUpdate={data.onDataEditorUpdate}
        />
      );
    }
  );

interface RootCell {
  cell: GridElement;
  row: number;
  col: number;
  style: CSSProperties;
  isOverflown?: boolean;
}

const getRootCell = (
  grid: GridElement[][],
  style: CSSProperties,
  visibleRow: number,
  visibleCol: number,
  globalRow: number,
  globalCol: number,
  getRowHeight: (idx: number) => number,
  getColumnWidth: (idx: number) => number,
  gridCache: GridCache
): RootCell | null => {
  const cell = grid[globalRow]?.[globalCol];

  const { rootCol, rootRow } = getRootCellCoords(cell, globalRow, globalCol);

  const overflowFromCol =
    cell.overflowFromCol !== undefined
      ? cell.overflowFromCol
      : cell.overflowColSpan !== undefined
      ? visibleCol
      : undefined;

  const isOverflownCell = overflowFromCol !== undefined;

  if (isOverflownCell) {
    return getOverflownCell(
      cell,
      grid,
      style,
      overflowFromCol,
      globalRow,
      globalCol,
      gridCache,
      getColumnWidth
    );
  }

  const isMergedCell = rootRow !== undefined && rootCol !== undefined;

  if (isMergedCell) {
    return getMergedCell(
      cell,
      grid,
      style,
      rootRow,
      rootCol,
      globalRow,
      globalCol,
      gridCache,
      getRowHeight,
      getColumnWidth
    );
  }

  return { cell, style, row: globalRow, col: globalCol };
};

const getOverflownCell = (
  cell: GridElement,
  grid: GridElement[][],
  style: CSSProperties,
  overflowFromCol: number,
  globalRow: number,
  globalCol: number,
  gridCache: GridCache,
  getColumnWidth: (idx: number) => number
) => {
  const overflowFromCellName = toA1(overflowFromCol, globalRow);
  const firstOverflownCell = gridCache.overflowFirstCells[overflowFromCellName];
  const isFirstOverflownCell =
    !firstOverflownCell ||
    (firstOverflownCell.row === globalRow && firstOverflownCell.col === globalCol);

  if (!isFirstOverflownCell) {
    return {
      cell,
      isOverflown: true,
      style,
      row: globalRow,
      col: globalCol,
    };
  }

  if (
    !firstOverflownCell ||
    (firstOverflownCell.col !== globalCol && firstOverflownCell.row !== globalRow)
  ) {
    gridCache.setFirstOverflowCell(globalRow, overflowFromCol, globalRow, globalCol);
  }

  const mergedRootCell =
    cell.overflowFromCol !== undefined ? grid[globalRow][cell.overflowFromCol] : cell;

  // we cannot just sum width of all previous columns, because it would ignore thins like rows
  // header.
  // So now, if we are at cell C1 merged into A1, we will subtract widths of columns C, B and A
  // instead to get a "left" position.
  let left = style.left as number;

  if (cell.overflowFromCol !== undefined) {
    for (let i = globalCol; i > overflowFromCol; i--) {
      left -= getColumnWidth(i);
    }
  }

  const width = range(
    overflowFromCol,
    overflowFromCol + (mergedRootCell.overflowColSpan || 0)
  ).reduce((acc, value) => acc + getColumnWidth(value + 1), 0);

  return {
    cell: mergedRootCell,
    style: { ...style, left, width },
    row: globalRow,
    col: overflowFromCol,
  };
};

const getMergedCell = (
  cell: GridElement,
  grid: GridElement[][],
  style: CSSProperties,
  rootRow: number,
  rootCol: number,
  globalRow: number,
  globalCol: number,
  gridCache: GridCache,
  getRowHeight: (idx: number) => number,
  getColumnWidth: (idx: number) => number
) => {
  const rootA1Name = toA1(rootCol, rootRow);

  const firstVisibleCell = gridCache.mergeFirstCells[rootA1Name];

  const isFirstVisibleCell =
    !firstVisibleCell ||
    (firstVisibleCell.row === globalRow && firstVisibleCell.col === globalCol);

  if (!isFirstVisibleCell) {
    return null;
  }

  if (
    !firstVisibleCell ||
    (firstVisibleCell.col !== globalCol && firstVisibleCell.row !== globalRow)
  ) {
    gridCache.setFirstMergeCell(rootRow, rootCol, globalRow, globalCol);
  }

  const mergedRootCell = cell.mergedInto
    ? grid[cell.mergedInto.row][cell.mergedInto.col]
    : cell;

  let top = style.top as number;
  for (let i = globalRow; i > rootRow; i--) {
    top -= getRowHeight(i);
  }

  let left = style.left as number;
  for (let i = globalCol; i > rootCol; i--) {
    left -= getColumnWidth(i);
  }

  const height = range(rootRow, rootRow + (mergedRootCell.rowSpan || 0)).reduce(
    (acc, value) => acc + getRowHeight(value + 1),
    0
  );
  const width = range(rootCol, rootCol + (mergedRootCell.colSpan || 0)).reduce(
    (acc, value) => acc + getColumnWidth(value + 1),
    0
  );
  return {
    cell: mergedRootCell,
    style: { ...style, top, left, height, width },
    row: rootRow,
    col: rootCol,
  };
};
