import React, { FunctionComponent, useCallback, useMemo } from "react";
import { useNeptyneSheetContext } from "./NeptyneSheet";
import {
  GridElement,
  selectionToRect,
  SheetUnawareCellAttributeUpdate,
} from "../SheetUtils";
import { observer } from "mobx-react";
import { useSheetSearchContext } from "../sheet-search/sheet-search.store";

import { GridData, VirtualizedGrid } from "./VirtualizedGrid";
import { SheetLocation } from "../SheetUtils";
import {
  DEFAULT_CELL_HEIGHT,
  DEFAULT_CELL_WIDTH,
  ROW_HEADER_WIDTH,
  getColSizes,
  getHiddenColHeaders,
  getHiddenRowHeaders,
  getRowSizes,
  visibleToGlobalIndex,
} from "./GridView";
import isEmpty from "lodash/isEmpty";
import { useAccessMode } from "../access-mode";
import { AccessMode } from "../NeptyneProtocol";

export interface NeptyneSheetRendererProps {
  editingCell: Partial<SheetLocation>;
  clearingCell: Partial<SheetLocation>;
  isForcedEdit: boolean;
  onNavigate: (rowDelta: number, colDelta: number) => void;
  onMouseDown: (row: number, col: number, event: React.MouseEvent) => void;
  onSelectCell: (row: number, col: number) => void;
  onMouseOver: (row: number, col: number, event: React.MouseEvent) => void;
  onDoubleClick: (row: number, col: number) => void;
  onContextMenu: (event: React.MouseEvent, row: number, col: number) => void;
  onChange: (row: number, col: number, value: GridElement["value"]) => void;
  onFinishEditing: (shouldFocusGrid?: boolean) => void;
  hideScrollbars?: boolean;
}

export const NeptyneSheetRenderer: FunctionComponent<NeptyneSheetRendererProps> =
  observer(
    ({
      editingCell,
      clearingCell,
      isForcedEdit,
      onNavigate,
      onMouseOver,
      onMouseDown,
      onSelectCell,
      onDoubleClick,
      onChange,
      onContextMenu,
      onFinishEditing,
      hideScrollbars,
    }) => {
      const {
        editMode,
        readOnly,
        grid,
        sheetAttributes,
        activeCell,
        autofillSelection,
        cutSelection,
        activeCellLocation,
        callServerMethod,
        isSelectingWhileEditing,
        isContextMenuVisible,
        isEditingFromTopEditor,
        virtualSelection,
        onWidgetChange,
        onAutofillDragStart,
        onAutofillCellMove,
        onAutofillDragStop,
        onUpdateCellValues,
        getAutocomplete,
        onCellAttributeChange,
        onDataEditorUpdate,
        onClickRow,
        onClickColumn,
        setContextMenuPosition,
        onHandleHeaderResize,
        handleHeaderUnhideClick,
        handleHeaderContextMenu,
        width,
        height,
        copyFormatSource,
        clientRowSizes,
      } = useNeptyneSheetContext();

      const sheetSearchStore = useSheetSearchContext();
      const accessMode = useAccessMode();

      const onCellAttributeChangeWrapper = useCallback(
        (changes: SheetUnawareCellAttributeUpdate[], operationId?: string) => {
          const mappedChanges = changes.map((change) => {
            const {
              cellId: [col, row],
              ...rest
            } = change;
            const mappedCol = visibleToGlobalIndex(
              col,
              sheetAttributes.colsHiddenHeaders
            );
            const mappedRow = visibleToGlobalIndex(
              row,
              sheetAttributes.rowsHiddenHeaders
            );
            return {
              cellId: [mappedCol, mappedRow],
              ...rest,
            } as SheetUnawareCellAttributeUpdate;
          });
          onCellAttributeChange(mappedChanges, operationId);
        },
        [
          onCellAttributeChange,
          sheetAttributes.colsHiddenHeaders,
          sheetAttributes.rowsHiddenHeaders,
        ]
      );

      const selectionRect = selectionToRect(virtualSelection);
      const isOneCellSelected =
        selectionRect.top === selectionRect.bottom &&
        selectionRect.left === selectionRect.right;

      const numRows = grid.length;
      const numCols = grid[0].length;

      const hiddenRowHeaders = useMemo(
        () => getHiddenRowHeaders(sheetAttributes, numRows),
        [sheetAttributes, numRows]
      );
      const hiddenColHeaders = useMemo(
        () => getHiddenColHeaders(sheetAttributes, numCols),
        [sheetAttributes, numCols]
      );

      const rowSizes = getRowSizes(sheetAttributes, numRows, clientRowSizes);
      const colSizes = getColSizes(sheetAttributes, numCols);

      const getRowHeight = useCallback(
        (index: number) => {
          if (index === 0) {
            return accessMode === AccessMode.App ? 2 : 20;
          }
          try {
            const globalIx = visibleToGlobalIndex(index - 1, hiddenRowHeaders ?? []);
            return rowSizes[globalIx];
          } catch (e) {
            return DEFAULT_CELL_HEIGHT;
          }
        },
        [hiddenRowHeaders, rowSizes, accessMode]
      );

      const getColumnWidth = useCallback(
        (index: number) => {
          if (index === 0) {
            return accessMode === AccessMode.App ? 2 : ROW_HEADER_WIDTH;
          }
          try {
            const globalIx = visibleToGlobalIndex(index - 1, hiddenColHeaders ?? []);
            return colSizes[globalIx];
          } catch (e) {
            return DEFAULT_CELL_WIDTH;
          }
        },
        [hiddenColHeaders, colSizes, accessMode]
      );

      const gridData: Omit<GridData, "gridCache"> = useMemo(
        () => ({
          dependsOn: !isEmpty(editingCell) ? activeCell.dependsOn ?? [] : [],
          activeCellLocation: activeCellLocation,
          autofillSelection,
          callServerMethod,
          clearingCell,
          copyFormatSource,
          cutSelection,
          getAutocomplete,
          hiddenRowHeaders,
          hiddenColHeaders,
          rowSizes,
          colSizes,
          grid,
          handleHeaderContextMenu,
          handleHeaderUnhideClick,
          isContextMenuVisible,
          isEditingFromTopEditor,
          isForcedEdit,
          isOneCellSelected,
          isSelectingWhileEditing,
          onAutofillCellMove,
          onAutofillDragStart,
          onAutofillDragStop,
          onCellAttributeChangeWrapper,
          onChange,
          onClickColumn,
          onClickRow,
          onContextMenu,
          onDataEditorUpdate,
          onDoubleClick,
          onFinishEditing,
          onHandleHeaderResize,
          onMouseDown,
          onSelectCell,
          onMouseOver,
          onNavigate,
          onUpdateCellValues,
          onWidgetChange,
          readOnly,
          selectionRect,
          sheetSelection: virtualSelection,
          setContextMenuPosition,
          areGridlinesHidden: sheetAttributes.areGridlinesHidden,
          currentSearchPosition: sheetSearchStore.currentPosition,
          searchMatches: sheetSearchStore.searchMatches,
          editMode,
          editingCell,
          clientRowSizes,
          getColumnWidth,
          getRowHeight,
        }),
        [
          activeCell.dependsOn,
          activeCellLocation,
          autofillSelection,
          callServerMethod,
          clearingCell,
          copyFormatSource,
          cutSelection,
          getAutocomplete,
          hiddenRowHeaders,
          hiddenColHeaders,
          rowSizes,
          colSizes,
          grid,
          handleHeaderContextMenu,
          handleHeaderUnhideClick,
          isContextMenuVisible,
          isEditingFromTopEditor,
          isForcedEdit,
          isOneCellSelected,
          isSelectingWhileEditing,
          onAutofillCellMove,
          onAutofillDragStart,
          onAutofillDragStop,
          onCellAttributeChangeWrapper,
          onChange,
          onClickColumn,
          onClickRow,
          onContextMenu,
          onDataEditorUpdate,
          onDoubleClick,
          onFinishEditing,
          onHandleHeaderResize,
          onMouseDown,
          onSelectCell,
          onMouseOver,
          onNavigate,
          onUpdateCellValues,
          onWidgetChange,
          readOnly,
          selectionRect,
          virtualSelection,
          setContextMenuPosition,
          sheetAttributes.areGridlinesHidden,
          sheetSearchStore.currentPosition,
          sheetSearchStore.searchMatches,
          editMode,
          editingCell,
          clientRowSizes,
          getColumnWidth,
          getRowHeight,
        ]
      );

      return (
        <VirtualizedGrid
          className="data-grid"
          columnCount={
            grid[0].length - (sheetAttributes.colsHiddenHeaders ?? []).length + 1
          }
          columnWidth={getColumnWidth}
          height={height}
          rowCount={grid.length - (sheetAttributes.rowsHiddenHeaders ?? []).length + 1}
          rowHeight={getRowHeight}
          width={width}
          frozenRowCount={(sheetAttributes.rowsFrozenCount ?? 0) + 1}
          frozenColumnCount={(sheetAttributes.colsFrozenCount ?? 0) + 1}
          gridData={gridData}
          hideScrollbars={hideScrollbars}
          hideHeaders={accessMode === AccessMode.App}
        />
      );
    }
  );
