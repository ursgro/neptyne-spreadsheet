import React, { Component, memo } from "react";

import ValueViewer from "./ValueViewer";
import { renderData, renderValue } from "./renderHelpers";
import {
  GridElement,
  isCellProtected,
  SheetUnawareCellAttributeUpdate,
} from "../../SheetUtils";
import { NeptyneCell } from "../../neptyne-sheet/NeptyneCell";
import { DataEditorRenderer } from "../../neptyne-sheet/DataEditorRenderer";
import { EditorStateConfig } from "@codemirror/state";
import {
  CellChangeWithRowCol,
  CurrentCellContent,
} from "../../neptyne-sheet/NeptyneSheet";
import { AutocompleteHandler } from "../../notebook/NotebookCellEditor/types";
import { CellAttribute, SheetUnawareCellId } from "../../NeptyneProtocol";
import { areEqual } from "react-window";

export interface DataCellProps {
  row: number;
  col: number;
  cell: GridElement;
  isForcedEdit: boolean;
  editing: boolean;
  clearing: boolean;
  isEditMode: boolean;
  isCurrentCell: boolean;
  isTheOnlyCellSelected: boolean;
  isInSelection: boolean;
  isCodeCell: boolean;
  isFrozenRowBound: boolean;
  isFrozenColBound: boolean;
  isReadOnly: boolean;
  isSearchHighlighted: boolean;
  isSearchSelected: boolean;
  hasAutoFillDragControl: boolean;
  hasTopAutoFillBorder?: boolean;
  hasRightAutoFillBorder?: boolean;
  hasBottomAutoFillBorder?: boolean;
  hasLeftAutoFillBorder?: boolean;
  hasTopCopyFormatBorder?: boolean;
  hasRightCopyFormatBorder?: boolean;
  hasBottomCopyFormatBorder?: boolean;
  hasLeftCopyFormatBorder?: boolean;
  hasTopCutBorder?: boolean;
  hasRightCutBorder?: boolean;
  hasBottomCutBorder?: boolean;
  hasLeftCutBorder?: boolean;
  isSelectingWhileEditing: boolean;
  isEditingFromTopEditor: boolean;
  areGridlinesHidden?: boolean;
  currentCellValue?: GridElement["value"];
  currentCellEditorSelection?: EditorStateConfig["selection"];
  activeRow?: number;
  activeColumn?: number;
  highlightColorIdx: number | undefined;
  isOverflown?: boolean;
  // Event handlers
  callServerMethod: (
    method: string,
    args: string[],
    kwargs: { [param: string]: any }
  ) => Promise<any>;
  onWidgetChange: (
    row: number,
    col: number,
    newVal: boolean | string | number | null
  ) => void;
  onAutofillDragStart: (row: number, col: number) => void;
  onAutofillCellMove: (row: number, col: number) => void;
  onAutofillDragStop: (row: number, col: number) => void;
  onNavigate: (rowDelta: number, colDelta: number) => void;
  onMouseDown: (row: number, col: number, event: React.MouseEvent) => void;
  onSelectCell: (row: number, col: number) => void;
  onMouseOver: (row: number, col: number, event: React.MouseEvent) => void;
  onDoubleClick: (row: number, col: number) => void;
  onContextMenu: (event: React.MouseEvent, row: number, col: number) => void;
  onChange: (row: number, col: number, value: DataCellState["value"]) => void;
  onFinishEditing: (shouldFocusGrid?: boolean) => void;
  onUpdateCellValues: (updates: CellChangeWithRowCol[], fromPaste?: boolean) => void;
  getAutocomplete: AutocompleteHandler;
  onCellAttributeChange: (changes: SheetUnawareCellAttributeUpdate[]) => void;
  onDataEditorUpdate: (cellContent: Partial<CurrentCellContent>) => void;
  style: React.CSSProperties;
  testId?: string;
}

interface DataCellState {
  reverting: boolean;
  committing: boolean;
  value: GridElement["value"];
}

function initialData({ cell }: DataCellProps) {
  return renderData(cell);
}

class DataCell extends Component<DataCellProps, DataCellState> {
  static defaultProps = {
    isForcedEdit: false,
    editing: false,
    clearing: false,
  };

  constructor(props: DataCellProps) {
    super(props);
    this.handleChange = this.handleChange.bind(this);
    this.handleFinishEditing = this.handleFinishEditing.bind(this);

    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseOver = this.handleMouseOver.bind(this);
    this.handleContextMenu = this.handleContextMenu.bind(this);
    this.handleDoubleClick = this.handleDoubleClick.bind(this);

    this.state = {
      reverting: false,
      committing: false,
      value: "",
    };
  }

  componentDidUpdate(prevProps: Readonly<DataCellProps>) {
    if (this.props.editing && !prevProps.editing) {
      const value = this.props.clearing ? "" : initialData(this.props);
      this.setState({ value, reverting: false });
    }
  }

  handleChange(value: DataCellState["value"]) {
    this.setState({ value, committing: false });
  }

  handleFinishEditing(shouldFocusGrid?: boolean) {
    this.setState({ reverting: true });
    this.props.onFinishEditing(shouldFocusGrid);
  }

  handleMouseDown(event: React.MouseEvent) {
    const { row, col, onMouseDown, cell } = this.props;
    if (!cell.disableEvents) {
      onMouseDown(row, col, event);
    }
  }

  handleMouseOver(event: React.MouseEvent) {
    const { row, col, onMouseOver, cell } = this.props;
    if (!cell.disableEvents) {
      onMouseOver(row, col, event);
    }
  }

  handleDoubleClick() {
    const { row, col, onDoubleClick, cell } = this.props;
    if (!cell.disableEvents) {
      onDoubleClick(row, col);
    }
  }

  handleContextMenu(event: React.MouseEvent) {
    const { row, col, onContextMenu, cell } = this.props;
    if (!cell.disableEvents) {
      onContextMenu(event, row, col);
    }
  }

  renderEditor() {
    const {
      editing,
      isEditMode,
      cell,
      row,
      col,
      activeRow,
      activeColumn,
      clearing,
      isReadOnly,
      isSelectingWhileEditing,
      isEditingFromTopEditor,
      onUpdateCellValues,
      getAutocomplete,
      onCellAttributeChange,
      onDataEditorUpdate,
      onNavigate,
    } = this.props;
    if (editing) {
      return (
        <DataEditorRenderer
          cell={cell}
          row={row}
          col={col}
          activeRow={activeRow!}
          activeColumn={activeColumn!}
          value={String(this.state.value || "")}
          gridValue={this.state.value}
          readOnly={isReadOnly}
          isEditMode={isEditMode}
          clearing={clearing}
          isSelectingWhileEditing={isSelectingWhileEditing}
          isEditingFromTopEditor={isEditingFromTopEditor}
          onChange={this.handleChange}
          onFinishEditing={this.handleFinishEditing}
          onUpdateCellValues={onUpdateCellValues}
          onCellAttributeChange={onCellAttributeChange}
          onUpdate={onDataEditorUpdate}
          getAutocomplete={getAutocomplete}
          onNavigate={onNavigate}
        />
      );
    }
  }

  renderViewer() {
    const { cell, row, col, isCurrentCell, isReadOnly } = this.props;
    const Viewer = cell.valueViewer || ValueViewer;
    const value = renderValue(cell);
    const shouldHaveKey =
      !!cell.attributes?.[CellAttribute.RenderWidth] &&
      !!cell.attributes?.[CellAttribute.RenderHeight];

    const cellProtected = isCellProtected(cell, isReadOnly);
    return (
      <Viewer
        cell={cell}
        row={row}
        col={col}
        value={value}
        onWidgetResize={this.handleWidgetResize}
        onSelectCell={this.onSelectCell}
        isCurrentCell={isCurrentCell}
        isReadOnly={isReadOnly || cellProtected}
        {...(shouldHaveKey
          ? {
              // this is a hacky way to re-render iframes. Library we use seemingly does not offer a way to
              // update iframe sizing once drawn
              key: `r${row}c${col}w${
                cell.attributes?.[CellAttribute.RenderWidth] || 0
              }h${cell.attributes?.[CellAttribute.RenderHeight] || 0}`,
            }
          : {})}
      />
    );
  }

  onSelectCell = () => {
    const { row, col, onSelectCell } = this.props;
    onSelectCell(row, col);
  };

  handleWidgetResize = (width: number, height: number) => {
    const { cell, row, col, onCellAttributeChange } = this.props;
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
      onCellAttributeChange(changes);
    }
  };

  render() {
    const {
      row,
      col,
      cell,
      editing,
      isCurrentCell,
      isEditMode,
      isTheOnlyCellSelected,
      isInSelection,
      isCodeCell,
      isFrozenRowBound,
      isFrozenColBound,
      isReadOnly,
      hasTopAutoFillBorder,
      hasRightAutoFillBorder,
      hasBottomAutoFillBorder,
      hasLeftAutoFillBorder,
      hasTopCutBorder,
      hasRightCutBorder,
      hasBottomCutBorder,
      hasLeftCutBorder,
      hasAutoFillDragControl,
      areGridlinesHidden,
      isSearchHighlighted,
      isSearchSelected,
      hasTopCopyFormatBorder,
      hasRightCopyFormatBorder,
      hasBottomCopyFormatBorder,
      hasLeftCopyFormatBorder,
      isOverflown,
      callServerMethod,
      onWidgetChange,
      onAutofillDragStart,
      onAutofillCellMove,
      onAutofillDragStop,
      style,
      highlightColorIdx,
      testId,
    } = this.props;
    const content = this.renderEditor() || this.renderViewer();

    const className = [
      "cell",
      isInSelection && "selected",
      editing && "editing",
      cell.readOnly && "read-only",
      isOverflown && "overflown",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <NeptyneCell
        isSearchHighlighted={isSearchHighlighted}
        isSearchSelected={isSearchSelected}
        isEditMode={isEditMode}
        isServerPending={!!cell.isServerPending}
        isCurrentCell={isCurrentCell}
        isCodeCell={isCodeCell}
        isTheOnlyCellSelected={isTheOnlyCellSelected}
        inSelection={isInSelection}
        isFrozenColBound={isFrozenColBound}
        isFrozenRowBound={isFrozenRowBound}
        highlightColorIdx={highlightColorIdx}
        areGridlinesHidden={areGridlinesHidden}
        readOnly={isReadOnly}
        showAutofillDragControl={hasAutoFillDragControl}
        row={row}
        col={col}
        cell={cell}
        className={className}
        editing={editing}
        style={style}
        callServerMethod={callServerMethod}
        onWidgetChange={onWidgetChange}
        onAutofillDragStart={onAutofillDragStart}
        onAutofillDragCellMove={onAutofillCellMove}
        onAutofillDragStop={onAutofillDragStop}
        onMouseDown={this.handleMouseDown}
        onMouseOver={this.handleMouseOver}
        onDoubleClick={this.handleDoubleClick}
        onDoubleTap={this.handleDoubleClick}
        onContextMenu={this.handleContextMenu}
        hasTopAutoFillBorder={hasTopAutoFillBorder}
        hasRightAutoFillBorder={hasRightAutoFillBorder}
        hasBottomAutoFillBorder={hasBottomAutoFillBorder}
        hasLeftAutoFillBorder={hasLeftAutoFillBorder}
        hasTopCutBorder={hasTopCutBorder}
        hasRightCutBorder={hasRightCutBorder}
        hasBottomCutBorder={hasBottomCutBorder}
        hasLeftCutBorder={hasLeftCutBorder}
        hasTopCopyFormatBorder={hasTopCopyFormatBorder}
        hasRightCopyFormatBorder={hasRightCopyFormatBorder}
        hasBottomCopyFormatBorder={hasBottomCopyFormatBorder}
        hasLeftCopyFormatBorder={hasLeftCopyFormatBorder}
        testId={testId}
      >
        {content}
      </NeptyneCell>
    );
  }
}

export default memo(DataCell, areEqual);
