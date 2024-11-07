import React, {
  createContext,
  CSSProperties,
  memo,
  MouseEventHandler,
  ReactNode,
  useContext,
} from "react";
import range from "lodash/range";
import { v4 as uuidV4 } from "uuid";
import {
  coordsToCellSelection,
  forEachCell,
  getCellContentWithRowCol,
  getCellContentWithSelection,
  getNormalizedSelection,
  getSelectionForData,
  GridElement,
  isCellProtected,
  OptionalSelection,
  rectToSelection,
  rectToCells,
  selectionToRect,
  SheetLocation,
  SheetSelection,
  SheetUnawareCellAttributeUpdate,
  skipContiguousCells,
  isEmptyCell,
} from "../SheetUtils";
import "../react-datasheet/src/react-datasheet.css";
import ReactDataSheet from "../react-datasheet";
import memoizeOne from "memoize-one";
import { EditorSelection } from "@codemirror/state";
import Stack from "@mui/material/Stack";
import {
  AccessMode,
  CellAttribute,
  Dimension,
  InsertDeleteContent,
  SheetTransform,
  SheetUnawareCellId,
} from "../NeptyneProtocol";

import {
  COLUMN_HEADER_HEIGHT,
  FIRST_COL_WIDTH,
  getColSizes,
  getHiddenColHeaders,
  getHiddenRowHeaders,
  getOffsetByPosition,
  getRowSizes,
  globalToVisibleIndex,
  NumberDict,
  SCROLL_BAR_SIZE,
  visibleToGlobalIndex,
} from "./GridView";
import { SheetAttributes } from "../neptyne-container/NeptyneContainer";
import { CellContextMenuAction } from "./NeptyneCell";
import { AutocompleteHandler } from "../notebook/NotebookCellEditor/types";
import { TopCodeEditor, TopCodeEditorProps } from "./TopCodeEditor";
import { canSelectWhileEditingSheet } from "./can-select-while-editing";
import { getCellFormattedValue, getCellOriginalValue } from "../RenderTools";
import { SheetFooter } from "./SheetFooter";
import {
  callWithNavigatorClipboard,
  copyToClipboard,
  fillSelectionWithClipboard,
  getCutId,
  getParsedClipboard,
  tryPasteImage,
} from "../clipboard";
import { createKeybindingsHandler } from "tinykeys";
import { Box } from "@mui/material";
import { DragResizeHandler } from "../components/HeaderResizeHandler/DragResizeHandler";
import { ContextMenu, ContextMenuPosition } from "./ContextMenu";
import { getSafeAbsoluteSelection, selectionsAreEqual } from "../SelectionUtils";
import { ExecutionPolicy } from "../ExecutionPolicy";
import { SystemStyleObject } from "@mui/system";
import {
  ModalContext,
  ModalDispatch,
  ModalReducerAction,
} from "../neptyne-container/NeptyneModals";
import { NoteDialog } from "../components/ToolbarControls/NoteDialog";
import NeptyneDataSheet, { isValidCoordinate } from "../react-datasheet/src/DataSheet";
import isEqual from "lodash/isEqual";
import { CodeMirrorApi } from "../codemirror-editor/CodeMirror";
import get from "lodash/get";
import { MeasurableOuterSheetContainer } from "./MeasurableOuterSheetContainer";
import clamp from "lodash/clamp";
import isEmpty from "lodash/isEmpty";
import defaultsDeep from "lodash/defaultsDeep";
import { EditorContent } from "../cell-id-picking/cell-id-picking.store";
import { WidgetDialogDataWrapper } from "../components/ToolbarControls/Widgets/WidgetDialogDataWrapper";
import upperFirst from "lodash/upperFirst";
import { hotKeys } from "../hotkeyConstants";
import {
  getAdjustedOneDimensionSelection,
  selectionToAutofillDragArgs,
} from "../autofill";
import { SheetSearchPanel } from "./SheetSearchPanel";
import ErrorBoundary from "../ErrorBoundary";
import { NavigationDirection } from "../merge-cells";
import { flushSync } from "react-dom";
import { isMobile } from "react-device-detect";
import { PasteSpecialStore } from "./PasteSpecial/paste-special.store";
import { useAccessMode } from "../access-mode";

const { DepParser, MAX_COLUMN, MAX_ROW } = require("fast-formula-parser");

export const GRID_WIDTH = 26;
export const GRID_HEIGHT = 1000;

const RESIZE_BAR_WIDTH = 8;

const CONTENT_CONTAINER_SX = {
  position: "relative",
  height: "100%",
};

const SHEET_CONTAINER_SX = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
};

const CODE_EDITOR_CONTAINER_SX = {
  bottom: 0,
  display: "flex",
  position: "absolute",
  right: 0,
  top: 0,
  borderTop: "1px solid",
  borderTopColor: "grey.300",
};

const OUTER_SX: SystemStyleObject = {
  backgroundColor: "background.default",
  flexGrow: 1,
  flexShrink: 1,
  minHeight: 0,
};

const OUTER_STYLE: CSSProperties = {
  overflow: "hidden",
  position: "relative",
};

const EMPTY_SELECTION = EditorSelection.single(0);

const formulaParser = new DepParser();

enum VirtualScrollDataType {
  Local,
  Global,
}

export interface CellChangeWithRowCol {
  row: number;
  col: number;
  value: string | null;
  // needed for correct value formatting
  attributes?: SheetAttributes;
  mimeType?: string;
}

export interface SheetProps {
  isModalOpen: boolean;
  activeRow: number;
  activeColumn: number;
  readOnly: boolean;
  grid: GridElement[][];
  nRows: number;
  nCols: number;
  // Preserved signature, no headers info here.
  sheetAttributes: SheetAttributes;
  clientRowSizes: NumberDict;
  cellContextMenuActions: CellContextMenuAction[];
  sheetContentRect: DOMRectReadOnly;
  dataSheetKey: string;
  currentSheetName?: string;
  copyFormatSource?: SheetSelection;
  onCopyFormat: (selection: SheetSelection) => void;
  onWidgetChange: (
    row: number,
    col: number,
    newVal: boolean | string | number | null
  ) => void;
  callServerMethod: (
    method: string,
    args: string[],
    kwargs: { [param: string]: any }
  ) => Promise<any>;
  onUpdateCellValues: (
    updates: CellChangeWithRowCol[],
    fromPaste?: boolean,
    cutId?: string | null,
    operationId?: string
  ) => void;
  onSelect: (
    selection: SheetSelection,
    options?: {
      direction?: NavigationDirection;
    }
  ) => void;
  onCopySelection: (location: SheetLocation | null, cutId: string | null) => void;
  sheetSelection: SheetSelection;
  cutSelection: SheetSelection | null;
  cutId: string | null;
  onClickRow: (row: number, shiftPressed?: boolean) => void;
  onClickColumn: (column: number, shiftPressed?: boolean) => void;
  onCellAttributeChange: (
    changes: SheetUnawareCellAttributeUpdate[],
    operationId?: string
  ) => void;
  onSheetAttributeChange: (name: string, newValue: any | undefined) => void;
  onFormulaDrag: (
    dragFrom: SheetSelection,
    toCellsStart: SheetUnawareCellId,
    toCellsEnd: SheetUnawareCellId
  ) => void;
  getAutocomplete: AutocompleteHandler;
  onInsertDeleteCells: (contents: InsertDeleteContent) => void;
  onHandleHeaderResize: (dimension: Dimension, ids: number[], size: number) => void;
  onHandleHeaderUnhide: (dimension: Dimension, ids: number[]) => void;
  onHandleHeaderAutosize: (dimension: Dimension, ids: number[]) => void;
  onExecutionPolicyValueChange: (value: number) => void;
  onMergeCells: (selection: SheetSelection) => void;
  onUnmergeCells: (selection: SheetSelection) => void;
  executionPolicyValue: number;
  topCodeEditorRenderer?: React.FunctionComponent<TopCodeEditorProps>;
  footerContent: ReactNode;
  sidePanel: ReactNode;
  sidePanelWidth: number;
  sidePanelVisible: boolean;
  onResizeCodeEditor: (width: number) => void;
  onResizeSheet: (entry: ResizeObserverEntry) => void;
  isColumnSelected: boolean;
  isRowSelected: boolean;
  modalDispatch: ModalDispatch | null;
  onBlur: () => void;

  isCellIdPicking: boolean;
  onCellIdPickingComplete: () => void;
  onCellIdPickingAbort: () => void;

  isSearchPanelOpen: boolean;
  hideScrollbars?: boolean;
  accessMode: AccessMode;
  pasteSpecialStore: PasteSpecialStore;
}

export interface CurrentCellContent extends EditorContent {
  row: number;
  col: number;
}

export interface SheetState {
  didPaste: boolean;
  autofillSelection?: SheetSelection;
  // data currently set in edited cell. Updated in real-time, even before submit
  currentCellContent?: CurrentCellContent;
  isReferencingCells: boolean;
  isSelectingWhileEditing: boolean;
  sheetNameStaged?: string;
  contextMenuPosition: ContextMenuPosition | null;
  editingCell: SheetLocation | {};
  isEditingFromTopEditor: boolean;
}

type NeptyneSheetContextInheritedValue = Pick<
  SheetProps,
  | "readOnly"
  | "sheetSelection" // Relative
  | "cutSelection" // Relative
  | "callServerMethod"
  | "onUpdateCellValues"
  | "getAutocomplete"
  | "onCellAttributeChange"
  | "onHandleHeaderResize"
  | "onClickRow"
  | "onClickColumn"
  | "sheetAttributes"
  | "copyFormatSource"
> &
  // prettier-ignore
  Pick<
    SheetState,
    | "isSelectingWhileEditing"
    | "autofillSelection" // Relative
    > & {
    editMode: boolean;
  };

type ParsedCell = {
  col: number;
  row: number;
  sheet?: string;
};

type ParsedRange = {
  from: { col: number; row: number };
  to: { col: number; row: number };
  sheet?: string;
};

export interface NeptyneSheetContextValue extends NeptyneSheetContextInheritedValue {
  virtualSelection: SheetSelection;
  grid: GridElement[][];
  activeCell: GridElement;
  autofillSelection?: SheetSelection;
  activeCellLocation: SheetLocation;
  globalActiveCellLocation: SheetLocation;
  isContextMenuVisible: boolean;
  onWidgetChange: (
    row: number,
    col: number,
    newVal: boolean | string | number | null
  ) => void;
  onAutofillDragStart: (row: number, col: number) => void;
  onAutofillCellMove: (row: number, col: number) => void;
  onAutofillDragStop: (row: number, col: number) => void;
  onDataEditorUpdate: (cellContent: Partial<CurrentCellContent>) => void;
  setContextMenuPosition: MouseEventHandler;
  handleHeaderUnhideClick: (dimension: Dimension, headerIndex: number) => void;
  handleHeaderContextMenu: (
    event: React.KeyboardEvent,
    dimension: Dimension,
    headerIndex: number
  ) => void;
  isEditingFromTopEditor: boolean;
  width: number;
  height: number;
  clientRowSizes: NumberDict;
}

export const NeptyneSheetContext = createContext<NeptyneSheetContextValue | null>(null);
export const CurrentValueContext = createContext<{
  value: CurrentCellContent["value"];
  editorSelection: CurrentCellContent["editorSelection"];
} | null>(null);

const getCellPositionOffset = (
  hiddenRowHeaders: number[],
  hiddenColHeaders: number[],
  rowSizes: NumberDict,
  colSizes: NumberDict,
  row: number,
  column: number
): { x: number; y: number } => {
  return {
    x: getOffsetByPosition(column, hiddenColHeaders, colSizes, false),
    y: getOffsetByPosition(row, hiddenRowHeaders, rowSizes, true),
  };
};

export const getVisibleHeadersDefinition = (numHeaders: number, hidden: number[]) =>
  range(0, numHeaders).filter((index) => !hidden?.includes(index));

export const selectionToRelative = (
  selection: SheetSelection,
  hiddenRows: number[],
  hiddenCols: number[],
  clampRow?: number,
  clampCol?: number
): SheetSelection => {
  return {
    start: {
      row: globalToVisibleIndex(selection.start.row, hiddenRows, clampRow),
      col: globalToVisibleIndex(selection.start.col, hiddenCols, clampCol),
    },
    end: {
      row: globalToVisibleIndex(selection.end.row, hiddenRows, clampRow),
      col: globalToVisibleIndex(selection.end.col, hiddenCols, clampCol),
    },
  };
};

class NeptyneSheet extends React.Component<SheetProps, SheetState> {
  reactDataSheet: React.RefObject<NeptyneDataSheet>;
  codePanelRef: React.RefObject<HTMLDivElement>;
  topCodeEditorRef: React.RefObject<CodeMirrorApi>;
  sheetContainerRef: React.RefObject<HTMLDivElement>;

  // we store it as a variable instead of state field because we don't need a rerender, just
  // a flag to prevent some callbacks.
  typedAlt = false;
  waitingPasteSpecial = false;
  isResizingCodePane = false;

  constructor(props: Readonly<SheetProps>) {
    super(props);

    this.state = {
      didPaste: false,
      isReferencingCells: false,
      isSelectingWhileEditing: false,
      contextMenuPosition: null,
      editingCell: {},
      isEditingFromTopEditor: false,
    };
    this.reactDataSheet = React.createRef();
    this.codePanelRef = React.createRef();
    this.topCodeEditorRef = React.createRef();
    this.sheetContainerRef = React.createRef();
    this.contextMenuSelect = this.contextMenuSelect.bind(this);
    this.onDataEditorUpdate = this.onDataEditorUpdate.bind(this);
    this.onInitiateClear = this.onInitiateClear.bind(this);
    this.onCodeMirrorSubmit = this.onCodeMirrorSubmit.bind(this);
    this.onCodeMirrorTabSubmit = this.onCodeMirrorTabSubmit.bind(this);
    this.handleNavigation = this.handleNavigation.bind(this);
    this.setContextMenuPosition = this.setContextMenuPosition.bind(this);
    this.handleHeaderUnhideClick = this.handleHeaderUnhideClick.bind(this);
    this.handleHeaderContextMenu = this.handleHeaderContextMenu.bind(this);
    this.hotKeysHandler = this.hotKeysHandler.bind(this);
  }

  componentDidUpdate(
    prevProps: Readonly<SheetProps>,
    prevState: Readonly<SheetState>,
    snapshot?: any
  ) {
    const hasActiveCellMoved =
      (this.props.activeRow !== this.state.currentCellContent?.row ||
        this.props.activeColumn !== this.state.currentCellContent?.col) &&
      (this.props.activeRow !== prevProps.activeRow ||
        this.props.activeColumn !== prevProps.activeColumn);

    const hasGridUpdated = this.props.grid !== prevProps.grid;
    if (
      (hasActiveCellMoved ||
        (hasGridUpdated && !isValidCoordinate(this.state.editingCell))) &&
      !this.state.isSelectingWhileEditing
    ) {
      this.resetDataEditorValue();
    }

    if (
      !this.props.isModalOpen &&
      prevProps.isModalOpen &&
      this.sheetContainerRef.current
    ) {
      this.sheetContainerRef.current.addEventListener("keydown", this.hotKeysHandler);
    } else if (
      this.props.isModalOpen &&
      !prevProps.isModalOpen &&
      this.sheetContainerRef.current
    ) {
      this.sheetContainerRef.current.removeEventListener(
        "keydown",
        this.hotKeysHandler
      );
    }

    if (
      this.props.sheetAttributes !== prevProps.sheetAttributes ||
      this.state.editingCell !== prevState.editingCell
    ) {
      this.props.pasteSpecialStore.endPasteSpecial();
    }
  }

  componentDidMount() {
    if (this.sheetContainerRef.current) {
      this.sheetContainerRef.current.addEventListener("keydown", this.hotKeysHandler);
    }
  }

  componentWillUnmount() {
    if (this.sheetContainerRef.current) {
      this.sheetContainerRef.current.removeEventListener(
        "keydown",
        this.hotKeysHandler.bind(this)
      );
    }
  }

  generateNeptyneSheetContextValue = memoizeOne(
    (
      readOnly: NeptyneSheetContextValue["readOnly"],
      globalActiveRow: number,
      globalActiveColumn: number,
      sheetSelection: SheetSelection,
      cutSelection: SheetSelection | null,
      sheetAttributesOnly: NeptyneSheetContextValue["sheetAttributes"],
      editMode: NeptyneSheetContextValue["editMode"],
      autofillSelection: SheetSelection | undefined,
      isSelectingWhileEditing: NeptyneSheetContextValue["isSelectingWhileEditing"],
      isContextMenuVisible: NeptyneSheetContextValue["isContextMenuVisible"],
      callServerMethod: SheetProps["callServerMethod"],
      onWidgetChange: NeptyneSheetContextValue["onWidgetChange"],
      onAutofillDragStart: NeptyneSheetContextValue["onAutofillDragStart"],
      onAutofillCellMove: NeptyneSheetContextValue["onAutofillCellMove"],
      onAutofillDragStop: NeptyneSheetContextValue["onAutofillDragStop"],
      onUpdateCellValues: NeptyneSheetContextValue["onUpdateCellValues"],
      getAutocomplete: NeptyneSheetContextValue["getAutocomplete"],
      onCellAttributeChange: NeptyneSheetContextValue["onCellAttributeChange"],
      onDataEditorUpdate: NeptyneSheetContextValue["onDataEditorUpdate"],
      onHandleHeaderResize: NeptyneSheetContextValue["onHandleHeaderResize"],
      onClickRow: NeptyneSheetContextValue["onClickRow"],
      onClickColumn: NeptyneSheetContextValue["onClickColumn"],
      setContextMenuPosition: NeptyneSheetContextValue["setContextMenuPosition"],
      handleHeaderUnhideClick: NeptyneSheetContextValue["handleHeaderUnhideClick"],
      handleHeaderContextMenu: NeptyneSheetContextValue["handleHeaderContextMenu"],
      grid: NeptyneSheetContextValue["grid"],
      activeCell: NeptyneSheetContextValue["activeCell"],
      isEditingFromTopEditor: NeptyneSheetContextValue["isEditingFromTopEditor"],
      width: number,
      height: number,
      copyFormatSource: NeptyneSheetContextValue["copyFormatSource"],
      clientRowSizes: NeptyneSheetContextValue["clientRowSizes"]
    ): NeptyneSheetContextValue => ({
      readOnly,
      editMode,
      sheetAttributes: sheetAttributesOnly,
      isSelectingWhileEditing,
      grid,
      activeCell,
      sheetSelection: selectionToRelative(
        sheetSelection,
        sheetAttributesOnly.rowsHiddenHeaders ?? [],
        sheetAttributesOnly.colsHiddenHeaders ?? [],
        grid.length,
        grid[0]?.length
      ),
      autofillSelection:
        autofillSelection &&
        selectionToRelative(
          autofillSelection,
          sheetAttributesOnly.rowsHiddenHeaders ?? [],
          sheetAttributesOnly.colsHiddenHeaders ?? [],
          grid.length,
          grid[0]?.length
        ),
      cutSelection:
        cutSelection &&
        selectionToRelative(
          cutSelection,
          sheetAttributesOnly.rowsHiddenHeaders ?? [],
          sheetAttributesOnly.colsHiddenHeaders ?? []
        ),
      globalActiveCellLocation: {
        row: globalActiveRow,
        col: globalActiveColumn,
      },
      activeCellLocation: {
        row: globalActiveRow,
        col: globalActiveColumn,
      },
      isContextMenuVisible,
      isEditingFromTopEditor,
      virtualSelection: sheetSelection,
      copyFormatSource:
        copyFormatSource &&
        selectionToRelative(
          copyFormatSource,
          sheetAttributesOnly.rowsHiddenHeaders ?? [],
          sheetAttributesOnly.colsHiddenHeaders ?? [],
          grid.length,
          grid[0]?.length
        ),

      callServerMethod,
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
      clientRowSizes,
    })
  );

  getCurrentValueContext = memoizeOne(
    (
      value: CurrentCellContent["value"],
      editorSelection: CurrentCellContent["editorSelection"]
    ) => ({ value, editorSelection })
  );

  handleUpdateCellValues = (
    updates: CellChangeWithRowCol[],
    fromPaste?: boolean | undefined,
    cutId?: string | null | undefined,
    operationId?: string | undefined
  ) => {
    this.props.onUpdateCellValues(updates, fromPaste, cutId, operationId);
    // usually we have to quit paste special mode when we update grid, with the exception
    // of paste action that initializes "paste special"
    if (this.waitingPasteSpecial) {
      this.waitingPasteSpecial = false;
    } else {
      this.props.pasteSpecialStore.endPasteSpecial();
    }
  };

  getNeptyneSheetContext(): NeptyneSheetContextValue {
    return this.generateNeptyneSheetContextValue(
      this.props.readOnly,
      this.props.activeRow,
      this.props.activeColumn,
      this.props.sheetSelection,
      this.props.cutSelection,
      this.props.sheetAttributes,
      isValidCoordinate(this.state.editingCell),
      this.state.autofillSelection,
      this.state.isSelectingWhileEditing,
      Boolean(this.state.contextMenuPosition),

      this.props.callServerMethod,
      this.onWidgetChange,
      this.onAutofillDragStart,
      this.onAutofillDragCellMove,
      this.onAutofillDragStop,
      this.props.onUpdateCellValues,
      this.props.getAutocomplete,
      this.props.onCellAttributeChange,
      this.onDataEditorUpdate,
      this.props.onHandleHeaderResize,
      this.handleClickRow,
      this.handleClickColumn,
      this.setContextMenuPosition,
      this.handleHeaderUnhideClick,
      this.handleHeaderContextMenu,

      this.props.grid,
      this.props.grid[this.props.activeRow][this.props.activeColumn],
      this.state.isEditingFromTopEditor,
      this.isResizingCodePane ? window.screen.width : this.props.sheetContentRect.width,
      this.props.sheetContentRect.height,
      this.props.copyFormatSource,
      this.props.clientRowSizes
    );
  }

  generateVirtualEditingCell = memoizeOne(
    (editingCell: SheetLocation | {}, hiddenRows?: number[], hiddenCols?: number[]) =>
      isValidCoordinate(editingCell)
        ? {
            row: globalToVisibleIndex(editingCell.row, hiddenRows ?? []),
            col: globalToVisibleIndex(editingCell.col, hiddenCols ?? []),
          }
        : {}
  );

  tryParseFormulaCell(newValue: string) {
    const cell = this.props.grid[this.props.activeRow][this.props.activeColumn];
    cell.dependsOn = [];
    if (!newValue.startsWith("=")) return;
    try {
      var result = formulaParser.parse(newValue.slice(1));
    } catch (e) {
      return;
    }
    result.forEach((cellOrRange: ParsedCell | ParsedRange) => {
      if (
        cellOrRange.sheet !== undefined &&
        cellOrRange.sheet !== this.props.currentSheetName
      ) {
        return;
      }

      if ("from" in cellOrRange) {
        // Range
        if (cellOrRange.to.col === MAX_COLUMN) {
          cellOrRange.to.col = GRID_WIDTH;
        }
        if (cellOrRange.to.row === MAX_ROW) {
          cellOrRange.to.row = GRID_HEIGHT;
        }

        const {
          from: { row: fromRow, col: fromCol },
          to: { row: toRow, col: toCol },
        } = cellOrRange;
        cell.dependsOn?.push({
          start: { row: fromRow - 1, col: fromCol - 1 },
          end: { row: toRow, col: toCol },
        });
      } else {
        // Cell
        const { row, col } = cellOrRange;
        cell.dependsOn?.push({
          start: { row: row - 1, col: col - 1 },
          end: { row, col },
        });
      }
    });
  }

  tryParseEditingCell(editingCell: SheetLocation | {}) {
    if ("col" in editingCell && "row" in editingCell) {
      const expr = this.props.grid[editingCell?.row][editingCell?.col].expression;
      if (expr) this.tryParseFormulaCell(expr);
    }
  }

  onInitiateClear({ row, col }: SheetLocation) {
    // We need flushSync here so that codeMirror doesn't render with the current
    // value and call an onUpdate
    flushSync(() => {
      this.setState(({ currentCellContent }) => ({
        currentCellContent: { ...currentCellContent!, value: "" },
      }));
    });
  }

  onDataEditorUpdate(newValue: Partial<CurrentCellContent>) {
    if (
      Object.keys(this.state.editingCell).length &&
      "value" in newValue &&
      newValue.value
    )
      this.tryParseFormulaCell(newValue.value);

    this.setState(
      ({ currentCellContent }) => ({
        currentCellContent: { ...currentCellContent!, ...newValue },
        didPaste: false,
      }),
      () => {
        // if user started editing from top code editor and meets these condition, this means they
        // want to finish it and continue editing
        const isFinishingEditing =
          isPureMovementSourceChange(newValue) &&
          this.state.isSelectingWhileEditing &&
          this.state.isEditingFromTopEditor;

        // codemirror inside top editor forcefully takes focus if content changes. We want to avoid
        // it during cell id picking to continue listening to arrow keys. So we have to focus on
        // grid when changes are made
        if (
          !isFinishingEditing &&
          this.state.isSelectingWhileEditing &&
          this.state.isEditingFromTopEditor
        )
          this.reactDataSheet.current?.focusOnRootElement();
      }
    );
  }

  updateFormulaValue(codeMirrorText: string) {
    this.props.onUpdateCellValues([
      {
        row: this.props.activeRow,
        col: this.props.activeColumn,
        value: codeMirrorText,
      },
    ]);
    this.reactDataSheet.current?.focusOnRootElement();
  }

  handleCodeMirrorSubmit(
    codeMirrorText: string,
    activeRow: number,
    activeColumn: number
  ) {
    this.updateFormulaValue(codeMirrorText);
    this.setState({ editingCell: {}, isEditingFromTopEditor: true });
    this.props.onSelect(coordsToCellSelection(activeRow, activeColumn));
  }

  handleClickRow = (
    headerIndex: number,
    shiftKeyPressed?: boolean,
    rightClick?: boolean
  ) => this.handleClickRowCol(Dimension.Row, headerIndex, shiftKeyPressed, rightClick);

  handleClickColumn = (
    headerIndex: number,
    shiftKeyPressed?: boolean,
    rightClick?: boolean
  ) => this.handleClickRowCol(Dimension.Col, headerIndex, shiftKeyPressed, rightClick);

  handleClickRowCol = (
    dimension: Dimension,
    headerIndex: number,
    shiftKeyPressed: boolean | undefined,
    rightClick?: boolean
  ) => {
    if (
      rightClick &&
      headerIndex >= this.props.sheetSelection.start[dimension] &&
      headerIndex <= this.props.sheetSelection.end[dimension]
    ) {
      return;
    }
    const shouldSelectWhileEditing = canSelectWhileEditingSheet(
      this.state.currentCellContent,
      this.state.isSelectingWhileEditing
    );
    if (shouldSelectWhileEditing) {
      this.handleSelectingWhileEditingStart();
    }

    const isSelectingWhileEditing =
      this.state.isSelectingWhileEditing || shouldSelectWhileEditing;
    if (isSelectingWhileEditing) {
      const offset = dimension === Dimension.Row ? 1 : 0;
      this.setState(({ currentCellContent }) => ({
        // preemptively setting state is too expensive,
        // so if user didn't actually edit cell - we get its value from props
        currentCellContent: {
          row: 0,
          col: 0,
          ...currentCellContent,
          ...getCellContentWithRowCol(
            this.state.currentCellContent || getFallbackCurrentCellContent(this.props),
            dimension,
            (shiftKeyPressed
              ? this.props.sheetSelection.start[
                  dimension === Dimension.Row ? "row" : "col"
                ]
              : headerIndex) + offset,
            headerIndex + offset
          ),
        },
        editingCell: {
          row: currentCellContent?.row || 0,
          col: currentCellContent?.col || 0,
        },
      }));
    }
    (dimension === Dimension.Row ? this.props.onClickRow : this.props.onClickColumn)(
      headerIndex,
      shiftKeyPressed
    );
  };

  onCodeMirrorSubmit(codeMirrorText: string) {
    this.handleCodeMirrorSubmit(
      codeMirrorText,
      this.props.activeRow + 1,
      this.props.activeColumn
    );
  }

  onCodeMirrorTabSubmit(codeMirrorText: string) {
    this.handleCodeMirrorSubmit(
      codeMirrorText,
      this.props.activeRow,
      this.props.activeColumn + 1
    );
  }

  contextMenuSelect(actionType: string) {
    const { sheetSelection, grid, modalDispatch } = this.props;
    if (this.reactDataSheet.current) {
      const { top, bottom, left, right } = selectionToRect(sheetSelection);
      const dimension = this.props.isRowSelected ? Dimension.Row : Dimension.Col;

      switch (actionType) {
        case "cut":
          this.handleCut(new ClipboardEvent("cut"));
          break;
        case "copy":
          this.handleCopy(new ClipboardEvent("copy"));
          break;
        case "paste":
          // the only way to programmatically access clipboard in modern Javascript is
          // navigator.clipboard api. So we use it and then create a mock clipboard event for
          // library to use. I also found no way to pass custom data inside ClipboardEvent
          // constructor.
          callWithNavigatorClipboard((e) => this.handlePaste(e));
          break;
        case "protect":
          this.handleSelectionAttributeChange(CellAttribute.IsProtected, "1");
          break;
        case "unprotect":
          this.handleSelectionAttributeChange(CellAttribute.IsProtected, "");
          break;
        case "delete_rows":
        case "delete_rows_and_shift":
          this.props.onInsertDeleteCells({
            sheetTransform: SheetTransform.Delete,
            dimension: Dimension.Row,
            selectedIndex: top,
            amount: bottom - top + 1,
            boundary:
              actionType === "delete_rows_and_shift"
                ? { min_col: left, max_col: right, min_row: top, max_row: -1 }
                : undefined,
          });
          break;
        case "delete_cols":
        case "delete_cols_and_shift":
          this.props.onInsertDeleteCells({
            sheetTransform: SheetTransform.Delete,
            dimension: Dimension.Col,
            selectedIndex: left,
            amount: right - left + 1,
            boundary:
              actionType === "delete_cols_and_shift"
                ? { min_col: left, max_col: -1, min_row: top, max_row: bottom }
                : undefined,
          });
          break;
        case "insert_rows":
        case "insert_rows_and_shift":
          this.props.onInsertDeleteCells({
            sheetTransform: SheetTransform.InsertBefore,
            dimension: Dimension.Row,
            selectedIndex: top,
            amount: bottom - top + 1,
            boundary:
              actionType === "insert_rows_and_shift"
                ? { min_col: left, max_col: right, min_row: top, max_row: -1 }
                : undefined,
          });
          break;
        case "insert_cols":
        case "insert_cols_and_shift":
          this.props.onInsertDeleteCells({
            sheetTransform: SheetTransform.InsertBefore,
            dimension: Dimension.Col,
            selectedIndex: left,
            amount: right - left + 1,
            boundary:
              actionType === "insert_cols_and_shift"
                ? { min_col: left, max_col: -1, min_row: top, max_row: bottom }
                : undefined,
          });
          break;
        case "edit_widget":
          const widgetName =
            grid[sheetSelection.start.row][sheetSelection.start.col].attributes
              ?.widgetName;
          if (widgetName) {
            modalDispatch?.({
              action: ModalReducerAction.Show,
              props: {
                element: WidgetDialogDataWrapper,
                elementProps: {
                  type: upperFirst(widgetName),
                  sheetSelection,
                },
              },
            });
          }
          break;
        case "insert_widget":
          // TODO: Make this work in a compatible way with the toolbar path.
          break;
        case "insert_note":
          modalDispatch?.({
            action: ModalReducerAction.Show,
            props: {
              element: NoteDialog,
            },
          });
          break;
        case "hide":
          const indexes = this.props.isRowSelected
            ? range(top, bottom + 1)
            : range(left, right + 1);
          this.props.onHandleHeaderResize(dimension, indexes, 0);
          this.closeContextMenu();
          if (this.props.isRowSelected) {
            this.handleClickRow(right);
          } else {
            this.handleClickColumn(bottom);
          }
          break;
        case "insert_above":
          this.props.onInsertDeleteCells({
            sheetTransform: SheetTransform.InsertBefore,
            dimension,
            selectedIndex: this.props.isRowSelected ? top : left,
            amount: this.props.isRowSelected ? bottom - top + 1 : right - left + 1,
          });
          break;
        case "autosize":
          this.props.onHandleHeaderAutosize(
            dimension,
            this.props.isRowSelected ? range(top, bottom + 1) : range(left, right + 1)
          );
          break;
        case "insert_below":
          this.props.onInsertDeleteCells({
            sheetTransform: SheetTransform.InsertBefore,
            dimension,
            selectedIndex: this.props.isRowSelected ? bottom + 1 : right + 1,
            amount: this.props.isRowSelected ? bottom - top + 1 : right - left + 1,
          });
          break;
        case "delete":
          this.props.onInsertDeleteCells({
            sheetTransform: SheetTransform.Delete,
            dimension,
            selectedIndex: this.props.isRowSelected ? top : left,
            amount: this.props.isRowSelected ? bottom - top + 1 : right - left + 1,
          });
          break;
        case "freeze":
          this.handleFreezeHeader(
            dimension,
            this.props.isRowSelected
              ? this.props.sheetSelection.start.row + 1
              : this.props.sheetSelection.start.col + 1
          );
          break;
        case "unfreeze":
          this.handleFreezeHeader(dimension, 0);
          break;
        case "merge":
          this.props.onMergeCells(this.props.sheetSelection);
          break;
        case "unmerge":
          this.props.onUnmergeCells(this.props.sheetSelection);
          break;
        default:
          break;
      }
    }
  }

  getVisibleHeaders = (): [cols: number[], rows: number[]] => {
    const { nRows, nCols, sheetAttributes } = this.props;
    return [
      getVisibleHeadersDefinition(nCols, getHiddenColHeaders(sheetAttributes, nCols)),
      getVisibleHeadersDefinition(nRows, getHiddenRowHeaders(sheetAttributes, nRows)),
    ];
  };

  handleNavigation(
    deltaRow: number,
    deltaColumn: number,
    isSelectionResizing: boolean = false,
    allowJump: boolean
  ) {
    const {
      sheetSelection: { start, end },
    } = this.props;
    const { isSelectingWhileEditing, editingCell } = this.state;
    const [cols, rows] = this.getVisibleHeaders();
    let updatedSelection: SheetSelection;
    const [oldRow, oldCol] = isSelectionResizing
      ? [end.row, end.col]
      : [start.row, start.col];
    const { newRow, newColumn } = getNewIndices(
      rows,
      cols,
      allowJump,
      oldRow,
      oldCol,
      deltaRow,
      deltaColumn
    );
    updatedSelection = {
      start: isSelectionResizing ? start : { row: newRow, col: newColumn },
      end: { row: newRow, col: newColumn },
    };

    const direction =
      (deltaRow > 0 && "bottom") ||
      (deltaRow < 0 && "top") ||
      (deltaColumn > 0 && "right") ||
      (deltaColumn < 0 && "left") ||
      undefined;

    this.handleCellIdPickingAwareSelection(updatedSelection, { direction });
    this.handleEditingChange(
      isSelectingWhileEditing ? editingCell : {},
      VirtualScrollDataType.Global
    );
  }

  getSkipContiguousCellsStateUpdate = (
    dimension: Dimension,
    direction: -1 | 1
  ): SheetSelection =>
    skipContiguousCells(
      dimension,
      direction,
      this.props.grid,
      this.props.sheetSelection.end,
      this.getVisibleHeaders()[dimension === Dimension.Col ? 0 : 1]
    );

  skipContiguousCells = (dimension: Dimension, direction: -1 | 1) => {
    this.handleCellIdPickingAwareSelection(
      this.getSkipContiguousCellsStateUpdate(dimension, direction)
    );
  };

  selectContiguousCells = (dimension: Dimension, direction: -1 | 1) => {
    this.handleCellIdPickingAwareSelection({
      ...this.getSkipContiguousCellsStateUpdate(dimension, direction),
      start: this.props.sheetSelection.start,
    });
  };

  muteCellEditHandler = (handler: (event: KeyboardEvent) => void) => {
    return (e: KeyboardEvent) => {
      const isEditing = isValidCoordinate(this.state.editingCell);
      if (isEditing) {
        return;
      }
      e.preventDefault();
      return handler(e);
    };
  };

  hotKeysHandler = createKeybindingsHandler({
    F2: this.muteCellEditHandler(() => {
      if (!isValidCoordinate(this.state.editingCell)) {
        (this.reactDataSheet.current as any)?.handleKey(
          new KeyboardEvent("keydown", {
            key: "Enter",
            keyCode: 13,
          })
        );
      }
    }),
    Home: this.muteCellEditHandler(() =>
      this.props.onSelect(coordsToCellSelection(this.props.sheetSelection.start.row, 0))
    ),
    "$mod+Home": this.muteCellEditHandler(() =>
      this.props.onSelect(coordsToCellSelection(0, 0))
    ),
    End: this.muteCellEditHandler(() => {
      const colsNum = this.props.grid[0].length - 1;
      if (this.props.sheetSelection.end.col < colsNum) {
        this.props.onSelect(
          coordsToCellSelection(this.props.sheetSelection.end.row, colsNum)
        );
      }
    }),
    "$mod+End": this.muteCellEditHandler(() => {
      const colsNum = this.props.grid[0].length - 1;
      const rowsNum = this.props.grid.length - 1;
      if (
        this.props.sheetSelection.end.col < colsNum ||
        this.props.sheetSelection.end.row < rowsNum
      ) {
        this.props.onSelect(coordsToCellSelection(rowsNum, colsNum));
      }
    }),
    "$mod+Backspace": this.muteCellEditHandler(() => {
      const { activeRow, activeColumn } = this.props;
      const shiftRow = activeRow > 0 ? -1 : 1;
      this.props.onSelect(coordsToCellSelection(activeRow + shiftRow, activeColumn));
      this.props.onSelect(coordsToCellSelection(activeRow, activeColumn));
    }),
    // context menu
    "$mod+Shift+Backslash": this.muteCellEditHandler(() =>
      this.openContextMenuByShortcut()
    ),
    "Shift+F10": this.muteCellEditHandler(() => this.openContextMenuByShortcut()),
    [hotKeys.skipRight]: this.muteCellEditHandler((event) =>
      this.skipContiguousCells(Dimension.Col, 1)
    ),
    [hotKeys.skipLeft]: this.muteCellEditHandler((event) =>
      this.skipContiguousCells(Dimension.Col, -1)
    ),
    [hotKeys.skipUp]: this.muteCellEditHandler((event) =>
      this.skipContiguousCells(Dimension.Row, -1)
    ),
    [hotKeys.skipDown]: this.muteCellEditHandler((event) =>
      this.skipContiguousCells(Dimension.Row, 1)
    ),
    [hotKeys.skipSelectRight]: this.muteCellEditHandler((event) =>
      this.selectContiguousCells(Dimension.Col, 1)
    ),
    [hotKeys.skipSelectLeft]: this.muteCellEditHandler((event) =>
      this.selectContiguousCells(Dimension.Col, -1)
    ),
    [hotKeys.skipSelectUp]: this.muteCellEditHandler((event) =>
      this.selectContiguousCells(Dimension.Row, -1)
    ),
    [hotKeys.skipSelectDown]: this.muteCellEditHandler((event) =>
      this.selectContiguousCells(Dimension.Row, 1)
    ),
    [hotKeys.escape]: this.muteCellEditHandler((event) =>
      this.props.pasteSpecialStore.endPasteSpecial()
    ),
    Alt: this.muteCellEditHandler(() => {
      this.typedAlt = true;
      setTimeout(() => {
        this.typedAlt = false;
      }, 1000);
    }),
  });

  handleNavigateToCoords = (row: number, col: number) => {
    this.props.onSelect(coordsToCellSelection(row, col));
  };

  openContextMenuByShortcut = () => {
    const { sheetAttributes, nCols, nRows, clientRowSizes } = this.props;
    const position = getCoordinatesOnGrid(
      sheetAttributes,
      nCols,
      nRows,
      clientRowSizes,
      this.props.activeRow,
      this.props.activeColumn
    );
    this.setState({
      contextMenuPosition: {
        x: position.x + this.props.sheetContentRect.left + FIRST_COL_WIDTH,
        y: position.y + this.props.sheetContentRect.top + COLUMN_HEADER_HEIGHT,
      },
    });
  };

  setContextMenuPosition(event: React.MouseEvent) {
    if (this.props.accessMode !== AccessMode.Edit) {
      return;
    }
    if (
      isValidCoordinate(this.state.editingCell) ||
      this.state.isSelectingWhileEditing
    ) {
      if (this.state.isSelectingWhileEditing) {
        // in case of cell selection, we do not need to show any context menu,
        // even default context menu
        event.preventDefault();
      }
      return;
    }

    event.preventDefault();
    const { contextMenuPosition } = this.state;
    if (!contextMenuPosition) {
      this.setState({
        contextMenuPosition: { x: event.clientX - 2, y: event.clientY - 2 },
      });
    } else {
      this.closeContextMenu();
    }
  }

  closeContextMenu = () => {
    this.setState({ contextMenuPosition: null });
  };

  handleHeaderUnhideClick = (dimension: Dimension, headerIndex: number) => {
    // If we have several hidden headers in a row (i.e in [1,2,3,6,7] we have [1,2,3] and [6,7],
    // we must make them all visible at once (click on 7 will unhide 6 and 7).
    // For this we should find the first visible header before the header that we want to unhide (5),
    // and then unhide all headers between this one and the header that we want to unhide (7).
    const hiddenHeaders =
      dimension === Dimension.Row
        ? this.props.sheetAttributes.rowsHiddenHeaders ?? []
        : this.props.sheetAttributes.colsHiddenHeaders ?? [];
    const firstVisibleHeader =
      range(headerIndex, 0).find(
        (header) => hiddenHeaders.indexOf(header) === -1 && header < headerIndex
      ) || -1;
    this.props.onHandleHeaderUnhide(
      dimension,
      range(firstVisibleHeader + 1, headerIndex + 1)
    );

    if (dimension === Dimension.Row) {
      this.handleClickRow(headerIndex);
    } else {
      this.handleClickColumn(headerIndex);
    }
  };

  handleHeaderContextMenu = (
    event: React.KeyboardEvent,
    dimension: Dimension,
    headerIndex: number
  ) => {
    if (dimension === Dimension.Row && !this.props.isRowSelected) {
      this.handleClickRow(headerIndex, event.shiftKey);
    } else if (dimension === Dimension.Col && !this.props.isColumnSelected) {
      this.handleClickColumn(headerIndex, event.shiftKey);
    }
  };

  onAutofillDragStart = () => {
    // handle cases when selection starts from below and goes above.
    // For autofill, we need to get selection with start at the top-left and end
    // at right-bottom.
    const rect = selectionToRect(this.props.sheetSelection);
    const autofillSelection = rectToSelection(rect);

    this.setState({ autofillSelection });
    this.reactDataSheet.current?.setAutofillDraggingState(true);
  };
  onAutofillDragCellMove = (row: number, col: number) => {
    if (this.state.autofillSelection) {
      this.setState({
        autofillSelection: getAdjustedOneDimensionSelection(
          this.props.sheetSelection,
          visibleToGlobalIndex(row, this.props.sheetAttributes.rowsHiddenHeaders ?? []),
          visibleToGlobalIndex(col, this.props.sheetAttributes.colsHiddenHeaders ?? [])
        ),
      });
    }
  };
  onAutofillDragStop = () => {
    const { autofillSelection } = this.state;
    if (autofillSelection) {
      const { onSelect, onFormulaDrag, sheetSelection } = this.props;
      if (!selectionsAreEqual(autofillSelection, sheetSelection)) {
        const { populateFrom, populateToStart, populateToEnd } =
          selectionToAutofillDragArgs(autofillSelection, sheetSelection);
        onFormulaDrag(populateFrom, populateToStart, populateToEnd);
        onSelect(autofillSelection);
      }
      this.setState({ autofillSelection: undefined });
      this.reactDataSheet.current?.setAutofillDraggingState(false);
      if (window.getSelection) {
        window.getSelection()?.removeAllRanges();
      }
    }
  };
  onWidgetChange = (
    row: number,
    col: number,
    newVal: string | number | boolean | null
  ) => {
    this.props.onWidgetChange(row, col, newVal);
  };

  handleTopCodeEditorClick = () => {
    this.setState({ isSelectingWhileEditing: false });
    if (this.state.currentCellContent) {
      this.props.onSelect(
        coordsToCellSelection(
          this.state.currentCellContent.row,
          this.state.currentCellContent.col
        )
      );
    }
  };

  handleFreezeHeader = (dimension: Dimension, idx: number) => {
    const sheetAttribute =
      dimension === Dimension.Col ? "colsFrozenCount" : "rowsFrozenCount";
    this.props.onSheetAttributeChange(sheetAttribute, idx);
  };

  handleWheelEvent = (e: React.WheelEvent<HTMLDivElement>) => {};

  handleCodeEditorResize = (size: number) => {
    this.props.onResizeCodeEditor(size);
  };

  resetDataEditorValue = () => {
    const cell = this.props.grid[this.props.activeRow][this.props.activeColumn];
    const returnValue = getCellFormattedValue(
      cell.value,
      cell.expression,
      cell.attributes
    );
    this.onDataEditorUpdate({
      value: returnValue,
      dynamicContentStart: returnValue.length,
      dynamicContentEnd: returnValue.length,
      editorSelection: returnValue.length
        ? EditorSelection.single(returnValue.length)
        : EMPTY_SELECTION,
      row: this.props.activeRow,
      col: this.props.activeColumn,
      // erase movement source, since we change the cell editor
      lastUserMovementSource: undefined,
    });
  };

  handleTopCodeEditorCancel = () => {
    this.resetDataEditorValue();
    this.setState({
      editingCell: {},
      isEditingFromTopEditor: false,
      isSelectingWhileEditing: false,
    });
    this.reactDataSheet.current?.focusOnRootElement();
  };

  handleCellIdPickingAwareSelection = (
    selection: OptionalSelection,
    options?: {
      direction?: NavigationDirection;
    }
  ) => {
    const { onSelect } = this.props;

    const safeSelection: SheetSelection = defaultsDeep(
      {},
      selection,
      this.props.sheetSelection
    );

    if (this.state.isSelectingWhileEditing) {
      this.setState(({ currentCellContent }) => ({
        // preemptively setting state is too expensive,
        // so if user didn't actually edit cell - we get its value from props
        currentCellContent: {
          row: 0,
          col: 0,
          ...currentCellContent,
          ...getCellContentWithSelection(
            this.state.currentCellContent || getFallbackCurrentCellContent(this.props),
            safeSelection
          ),
        },
      }));
    }
    onSelect(safeSelection, options);
  };

  handleCellsChange = (
    changes: ReactDataSheet.CellsChangedArgs<GridElement>,
    additions?: ReactDataSheet.CellAdditionsArgs
  ) => {
    const { onUpdateCellValues } = this.props;
    const { didPaste } = this.state;
    onUpdateCellValues(this.adjustDataSheetChanges(changes, additions || []), didPaste);
    this.setState({ didPaste: false });
  };

  handleSelectingWhileEditingComplete = (
    row: number | null,
    col: number | null,
    shouldBeEditing: boolean
  ) => {
    const {
      sheetAttributes,
      onSelect,
      onUpdateCellValues,
      isCellIdPicking,
      onCellIdPickingComplete,
    } = this.props;
    if (isCellIdPicking) {
      onCellIdPickingComplete();
      return;
    }
    const shouldUpdateSelection = row !== null && col !== null;
    if (shouldBeEditing) {
      if (this.state.isEditingFromTopEditor) {
        this.topCodeEditorRef.current?.focus();
      }
      this.setState({
        isSelectingWhileEditing: false,
      });
      if (shouldUpdateSelection) {
        const absoluteRow = visibleToGlobalIndex(
          row,
          sheetAttributes.rowsHiddenHeaders ?? []
        );
        const absoluteCol = visibleToGlobalIndex(
          col,
          sheetAttributes.colsHiddenHeaders ?? []
        );
        onSelect(coordsToCellSelection(absoluteRow, absoluteCol));
      }
    } else {
      const currentRow = this.state.currentCellContent!.row;
      const currentCol = this.state.currentCellContent!.col;
      const value = this.state.currentCellContent!.value;
      // stop cell reference
      this.setState({
        isSelectingWhileEditing: false,
        currentCellContent: undefined,
        isEditingFromTopEditor: false,
        editingCell: {},
      });
      // move to cell below the focused one, just like after ordinary submit
      if (shouldUpdateSelection) {
        const absoluteRow = visibleToGlobalIndex(
          row,
          sheetAttributes.rowsHiddenHeaders ?? []
        );
        const absoluteCol = visibleToGlobalIndex(
          col,
          sheetAttributes.colsHiddenHeaders ?? []
        );
        onSelect(coordsToCellSelection(absoluteRow, absoluteCol));
      }
      // send updated value
      onUpdateCellValues([
        {
          row: currentRow,
          col: currentCol,
          value: getCellOriginalValue(value),
        },
      ]);
    }
  };

  handleSelectingWhileEditingAbort = () => {
    if (this.props.isCellIdPicking) {
      this.props.onCellIdPickingAbort();
      return;
    }
    this.setState({
      isSelectingWhileEditing: false,
      currentCellContent: undefined,
      editingCell: {},
      isEditingFromTopEditor: false,
    });
  };

  handleSelectingWhileEditingStart = () => {
    flushSync(() => {
      this.setState({ isSelectingWhileEditing: true });
    });
  };

  cantGoToEditMode = (cell: GridElement): boolean => {
    const attributes = cell.attributes;
    if (
      isCellProtected(cell, this.props.accessMode === AccessMode.App) ||
      !!attributes?.[CellAttribute.Widget]
    ) {
      return true;
    }
    return !!cell.readOnly;
  };

  render() {
    const {
      grid,
      sheetSelection,
      activeColumn,
      activeRow,
      topCodeEditorRenderer,
      getAutocomplete,
      footerContent,
      sidePanel,
      sheetAttributes,
      executionPolicyValue,
      onExecutionPolicyValueChange,
    } = this.props;
    const { isSelectingWhileEditing, currentCellContent } = this.state;
    const activeCell = grid[activeRow][activeColumn];
    const topCodeEditorKey = isSelectingWhileEditing
      ? `${currentCellContent?.col}|${currentCellContent?.row}`
      : `${activeColumn}|${activeRow}`;
    const currentColumn = isSelectingWhileEditing
      ? currentCellContent!.col
      : activeColumn;
    const currentRow = isSelectingWhileEditing ? currentCellContent!.row : activeRow;

    const topCodeEditorClasses = ["code-container", "top-editor"];

    const isTopEditorProtected = isCellProtected(grid[activeRow][activeColumn]);
    if (isTopEditorProtected) {
      topCodeEditorClasses.push("protected");
    }
    const isTopEditorReadOnly = isTopEditorProtected || this.props.readOnly;

    const virtualEditingCell = this.generateVirtualEditingCell(
      this.state.editingCell,
      sheetAttributes.rowsHiddenHeaders,
      sheetAttributes.colsHiddenHeaders
    );

    const { expression } = grid[activeRow][activeColumn];
    const code = expression || "";

    const TopEditor = topCodeEditorRenderer || TopCodeEditor;

    return (
      <Box id="#outer" sx={OUTER_SX}>
        <Stack direction="row" sx={CONTENT_CONTAINER_SX}>
          {(!isMobile || !this.props.sidePanelVisible) && (
            <Box
              sx={SHEET_CONTAINER_SX}
              style={this.getSheetContainerStyle(
                this.props.sidePanelVisible,
                this.props.sidePanelWidth
              )}
            >
              {this.props.accessMode !== AccessMode.App && (
                <Box
                  flexShrink={0}
                  data-testid="code-container"
                  className={topCodeEditorClasses.join(" ")}
                >
                  <TopEditor
                    ref={this.topCodeEditorRef}
                    readOnly={isTopEditorReadOnly}
                    key={topCodeEditorKey}
                    cell={activeCell}
                    activeColumn={currentColumn}
                    activeRow={currentRow}
                    value={currentCellContent?.value ?? code}
                    selection={this.state.currentCellContent?.editorSelection}
                    onSubmit={this.onCodeMirrorSubmit}
                    onTabSubmit={this.onCodeMirrorTabSubmit}
                    getAutocomplete={getAutocomplete}
                    isSelectingWhileEditing={isSelectingWhileEditing}
                    onUpdate={this.onDataEditorUpdate}
                    onTopEditorClick={this.handleTopCodeEditorClick}
                    onUpdateCellValues={this.props.onUpdateCellValues}
                    onCellAttributeChange={this.props.onCellAttributeChange}
                    onEditingChange={this.handleTopCodeEditingChange}
                    onCancel={this.handleTopCodeEditorCancel}
                    onBlur={this.handleTopCodeEditorBlur}
                  />
                  <ExecutionPolicy
                    readOnly={isTopEditorReadOnly}
                    value={executionPolicyValue}
                    valueChanged={onExecutionPolicyValueChange}
                  />
                </Box>
              )}
              <Stack
                direction="row"
                flexGrow={1}
                flexShrink={1}
                minHeight={0}
                position="relative"
              >
                {this.props.isSearchPanelOpen && (
                  <SheetSearchPanel
                    grid={grid}
                    onNavigateToCoords={this.handleNavigateToCoords}
                  />
                )}
                <MeasurableOuterSheetContainer
                  style={OUTER_STYLE}
                  onResize={this.props.onResizeSheet}
                  hideScrollbars={this.props.hideScrollbars}
                >
                  <div
                    id="inner-sheet_container"
                    onContextMenu={this.setContextMenuPosition}
                    ref={this.sheetContainerRef}
                  >
                    <NeptyneSheetContext.Provider value={this.getNeptyneSheetContext()}>
                      <CurrentValueContext.Provider
                        value={
                          this.state.currentCellContent
                            ? this.getCurrentValueContext(
                                this.state.currentCellContent?.value,
                                this.state.currentCellContent?.editorSelection
                              )
                            : null
                        }
                      >
                        <NeptyneDataSheet
                          key={this.props.dataSheetKey}
                          isCopyingFormat={!!this.props.copyFormatSource}
                          onCopyFormat={this.handleCopyFormat}
                          ref={this.reactDataSheet}
                          data={this.props.grid}
                          cantGoToEditMode={this.cantGoToEditMode}
                          isSelectingWhileEditing={
                            this.state.isSelectingWhileEditing ||
                            this.props.isCellIdPicking
                          }
                          onCellsChanged={this.handleCellsChange}
                          onSelect={this.handleCellIdPickingAwareSelection}
                          onSelectWhileEditingStart={
                            this.handleSelectingWhileEditingStart
                          }
                          onSelectWhileEditingAbort={
                            this.handleSelectingWhileEditingAbort
                          }
                          onSelectWhileEditingComplete={
                            this.handleSelectingWhileEditingComplete
                          }
                          editing={virtualEditingCell}
                          onEditingChange={this.handleEditingChange}
                          onInitiateClear={this.onInitiateClear}
                          onNavigate={this.handleNavigation}
                          selected={sheetSelection}
                          canSelectWhileEditing={canSelectWhileEditingSheet(
                            this.state.currentCellContent,
                            this.state.isSelectingWhileEditing
                          )}
                          onCopy={this.handleCopy}
                          onPaste={this.handlePaste}
                          onCut={this.handleCut}
                          onBlur={this.props.onBlur}
                          hideScrollbars={this.props.hideScrollbars}
                        />
                      </CurrentValueContext.Provider>
                    </NeptyneSheetContext.Provider>
                  </div>
                </MeasurableOuterSheetContainer>
                {!this.props.hideScrollbars && (
                  <Box
                    height={SCROLL_BAR_SIZE}
                    width={SCROLL_BAR_SIZE}
                    position="absolute"
                    right={0}
                    bottom={0}
                    bgcolor="#f8f8f8"
                  />
                )}
              </Stack>
              {this.props.accessMode !== AccessMode.App && (
                <SheetFooter>{footerContent}</SheetFooter>
              )}
            </Box>
          )}
          {this.props.sidePanelVisible && (
            <>
              {!isMobile && (
                <Stack>
                  <DragResizeHandler
                    dimension={Dimension.Col}
                    onResizing={this.handleCodeEditorResize}
                    onResizeStart={this.handleResizeStart}
                    onResizeStop={this.handleResizeStop}
                    parentRef={this.codePanelRef}
                    minSize={50}
                    className={"code-resize-bar"}
                    invert
                  >
                    <Box
                      id="resize-bar"
                      width={RESIZE_BAR_WIDTH}
                      height="100%"
                      display="flex"
                      flexDirection="column"
                      justifyContent="center"
                      alignItems="center"
                    />
                  </DragResizeHandler>
                </Stack>
              )}
              <Box
                component="div"
                ref={this.codePanelRef}
                style={this.getCodePaneStyle(
                  this.props.sidePanelWidth,
                  !this.props.sidePanelVisible || !isMobile
                )}
                sx={CODE_EDITOR_CONTAINER_SX}
              >
                {sidePanel}
              </Box>
            </>
          )}
        </Stack>
        <ContextMenu
          canDeleteDimension={Boolean(
            get(this.props.grid, this.props.isRowSelected ? "length" : "0.length")
          )}
          isColumnSelected={this.props.isColumnSelected}
          isRowSelected={this.props.isRowSelected}
          frozenRows={this.props.sheetAttributes.rowsFrozenCount ?? 0}
          frozenCols={this.props.sheetAttributes.colsFrozenCount ?? 0}
          contextMenuPosition={this.state.contextMenuPosition}
          cellContextMenuActions={this.props.cellContextMenuActions}
          sheetSelection={this.props.sheetSelection}
          onClose={this.closeContextMenu}
          onClick={this.contextMenuSelect}
        />
      </Box>
    );
  }

  // We convert here from local coordinates to global, but if there are more changes than one, it is
  // (presumably?) a paste, and we need to also paste into hidden and out of view colums/rows, so we can't
  // just convert everything to global. Instead use an offset.
  private adjustDataSheetChanges(
    changes: ReactDataSheet.CellsChangedArgs<GridElement>,
    additions: ReactDataSheet.CellAdditionsArgs
  ) {
    const unadjustedCellChanges: CellChangeWithRowCol[] = additions.concat(changes);
    let minRow = Infinity;
    let minCol = Infinity;
    for (let change of unadjustedCellChanges) {
      minRow = Math.min(minRow, change.row);
      minCol = Math.min(minCol, change.col);
    }
    const dRow =
      visibleToGlobalIndex(minRow, this.props.sheetAttributes.rowsHiddenHeaders ?? []) -
      minRow;
    const dCol =
      visibleToGlobalIndex(minCol, this.props.sheetAttributes.colsHiddenHeaders ?? []) -
      minCol;

    return unadjustedCellChanges.map((change) => {
      return {
        ...change,
        row: change.row + dRow,
        col: change.col + dCol,
      };
    });
  }

  private handleTopCodeEditorBlur = () => {
    if (!this.state.isSelectingWhileEditing) {
      this.handleEditingChange({});
      this.setState({ isEditingFromTopEditor: false });
    }
  };

  private handleSelectionAttributeChange = (
    name: string,
    newValue: string | undefined
  ): void => {
    const { sheetSelection, onCellAttributeChange } = this.props;
    const {
      left: minX,
      right: maxX,
      top: minY,
      bottom: maxY,
    } = selectionToRect(sheetSelection);
    const changes: SheetUnawareCellAttributeUpdate[] = [];

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        changes.push({ cellId: [x, y], attribute: name, value: newValue });
      }
    }
    onCellAttributeChange(changes);
  };

  private handleCopy = (e: ClipboardEvent, cutId?: string) => {
    const { onCopySelection, grid, sheetSelection } = this.props;

    if (!isValidCoordinate(this.state.editingCell)) {
      onCopySelection(getNormalizedSelection(sheetSelection).start, cutId ?? null);
      copyToClipboard(e, grid, sheetSelection, cutId);
    }
  };

  private handlePaste = (e: ClipboardEvent) => {
    if ((e.target as HTMLElement).tagName.toLowerCase() === "input") {
      // Don't run our paste code if an input element has the focus (autocomplete)
      return;
    }
    if (isValidCoordinate(this.state.editingCell)) {
      return;
    }
    const handleNonImagePaste = (
      cellUpdates: GridElement[][],
      sheetSelection: SheetSelection
    ) => {
      this.setState({ didPaste: true }, () => {
        const { cutId: stateCutId, grid, onSelect, onUpdateCellValues } = this.props;
        const cutId = getCutId(e);
        const isCutting = cutId !== null && stateCutId === cutId;
        const [changes, updatedSelection] = pasteDataToGridUpdates(
          grid,
          cellUpdates,
          sheetSelection,
          !isCutting
        );

        const operationId = uuidV4(); // Combine these operations in undo/redo.
        onUpdateCellValues(
          changes,
          // Preventing formula mutations on parting cut content.
          this.state.didPaste,
          cutId,
          operationId
        );
        this.setState({ didPaste: false });
        onSelect(updatedSelection);
      });
    };
    const handleImagePaste = (mimeType: string, data: string) => {
      const { onUpdateCellValues, sheetSelection } = this.props;
      const cutId = getCutId(e);
      const operationId = uuidV4();
      const changes: CellChangeWithRowCol[] = [
        {
          col: sheetSelection.start.col,
          row: sheetSelection.start.row,
          value: data,
          mimeType: mimeType,
        },
      ];

      onUpdateCellValues(
        changes,
        // Preventing formula mutations on parting cut content.
        true,
        cutId,
        operationId
      );
    };
    const normalizedSelection = getNormalizedSelection(this.props.sheetSelection);
    const cellUpdates = getParsedClipboard(e, normalizedSelection);

    if (cellUpdates.length > 0) {
      handleNonImagePaste(cellUpdates, normalizedSelection);

      const selectionRect = {
        top: normalizedSelection.start.row,
        left: normalizedSelection.start.col,
        bottom: Math.max(
          normalizedSelection.end.row,
          normalizedSelection.start.row + cellUpdates.length - 1
        ),
        right: Math.max(
          normalizedSelection.end.col,
          normalizedSelection.start.col + cellUpdates[0].length - 1
        ),
      };

      const { sheetAttributes, nCols, nRows, clientRowSizes, grid } = this.props;

      const rowsFrozenCount = sheetAttributes.rowsFrozenCount ?? 0;
      const colsFrozenCount = sheetAttributes.colsFrozenCount ?? 0;
      const position = getCoordinatesOnGrid(
        sheetAttributes,
        nCols,
        nRows,
        clientRowSizes,
        (selectionRect.top <= rowsFrozenCount
          ? selectionRect.top
          : selectionRect.top - rowsFrozenCount) + 1,
        (selectionRect.left <= colsFrozenCount
          ? selectionRect.left
          : selectionRect.left - colsFrozenCount) + 1
      );

      this.props.pasteSpecialStore.startPasteSpecial(
        {
          x: position.x,
          y: position.y,
        },
        rectToCells(selectionRect, grid),
        cellUpdates,
        normalizedSelection,
        handleNonImagePaste
      );
      this.waitingPasteSpecial = true;
    } else {
      tryPasteImage(e, handleImagePaste);
    }
  };

  handleResizeStart = () => {
    this.isResizingCodePane = true;
  };
  handleResizeStop = () => {
    this.isResizingCodePane = false;
  };

  private handleCut = (event: ClipboardEvent) => {
    const { editingCell } = this.state;
    if (!isEmpty(editingCell)) return;

    const cutId = uuidV4();
    this.handleCopy(event, cutId);
  };

  private handleEditingChange = (
    editingCell: SheetLocation | {},
    mode: VirtualScrollDataType = VirtualScrollDataType.Local
  ) => {
    if (this.typedAlt || isEqual(editingCell, this.state.editingCell)) {
      return;
    }

    this.setState(({ editingCell: prevEditingCell, isEditingFromTopEditor }) => {
      if (isValidCoordinate(editingCell)) {
        if (mode === VirtualScrollDataType.Local) {
          editingCell = {
            row: visibleToGlobalIndex(
              editingCell.row,
              this.props.sheetAttributes.rowsHiddenHeaders ?? []
            ),
            col: visibleToGlobalIndex(
              editingCell.col,
              this.props.sheetAttributes.colsHiddenHeaders ?? []
            ),
          };
          this.tryParseEditingCell(editingCell);
        }
        return {
          editingCell: editingCell,
          isEditingFromTopEditor: isEqual(prevEditingCell, editingCell)
            ? isEditingFromTopEditor
            : false,
        };
      }
      return { editingCell, isEditingFromTopEditor: false };
    });
  };

  private handleTopCodeEditingChange = (editingCell: SheetLocation | {}) => {
    !this.state.isSelectingWhileEditing &&
      this.setState({ editingCell, isEditingFromTopEditor: true });
    this.tryParseEditingCell(editingCell);
  };

  handleCopyFormat = (selection: SheetSelection) => {
    this.props.onCopyFormat(
      getSafeAbsoluteSelection(
        selection,
        this.props.sheetSelection,
        this.props.sheetAttributes.rowsHiddenHeaders,
        this.props.sheetAttributes.colsHiddenHeaders
      )
    );
  };

  getCodePaneStyle = memoizeOne((width: number, sheetVisible: boolean) => ({
    width: sheetVisible ? width - RESIZE_BAR_WIDTH : "100%",
  }));

  getSheetContainerStyle = memoizeOne((isVisible: boolean, width: number) => ({
    width: isVisible ? `calc(100vw - ${width}px)` : "100vw",
  }));
}

const getFallbackCurrentCellContent = ({
  grid,
  activeRow,
  activeColumn,
}: SheetProps): CurrentCellContent => ({
  value: grid[activeRow][activeColumn].expression || "",
  dynamicContentStart: grid[activeRow][activeColumn].expression?.length || 0,
  dynamicContentEnd: grid[activeRow][activeColumn].expression?.length || 0,
  row: activeRow,
  col: activeColumn,
  editorSelection: grid[activeRow][activeColumn].expression?.length
    ? EditorSelection.single(grid[activeRow][activeColumn].expression!.length)
    : EMPTY_SELECTION,
});

const pasteDataToGridUpdates = (
  grid: GridElement[][],
  cellUpdates: GridElement[][],
  selection: SheetSelection,
  fillSelection: boolean = true
): [changes: CellChangeWithRowCol[], updatedSelection: SheetSelection] => {
  const normalizedSelection = getNormalizedSelection(selection);
  const pasteData = fillSelection
    ? fillSelectionWithClipboard(cellUpdates, selection)
    : cellUpdates;

  const changes: CellChangeWithRowCol[] = [];
  const adjustedSelection = getSelectionForData(normalizedSelection.start, pasteData);

  forEachCell(pasteData, (cell, coordinates) => {
    const row = normalizedSelection.start.row + coordinates.row;
    const col = normalizedSelection.start.col + coordinates.col;
    if (isEmptyCell(cell) && (!grid[row]?.[col] || isEmptyCell(grid[row]?.[col]))) {
      return;
    }
    const { expression, attributes = {} } = cell;
    changes.push({
      row,
      col,
      value: expression,
      attributes,
    });
  });

  return [changes, adjustedSelection];
};

const isPureMovementSourceChange = (newValue: Partial<CurrentCellContent>) =>
  Object.keys(newValue).length === 1 &&
  Object.keys(newValue).includes("lastUserMovementSource");

export const useNeptyneSheetContext = (): NeptyneSheetContextValue => {
  const neptyneSheetContext = useContext(NeptyneSheetContext);

  if (neptyneSheetContext === null) {
    throw new Error("You can only use NeptyneSheetContext under NeptyneSheet!");
  }

  return neptyneSheetContext;
};

function NeptyneSheetWrapper(props: Omit<SheetProps, "modalDispatch" | "accessMode">) {
  const accessMode = useAccessMode();
  return (
    <ErrorBoundary>
      <ModalContext.Consumer>
        {(modalDispatch) => (
          <NeptyneSheet
            accessMode={accessMode}
            modalDispatch={modalDispatch}
            {...props}
          />
        )}
      </ModalContext.Consumer>
    </ErrorBoundary>
  );
}

const getCoordinatesOnGrid = (
  sheetAttributes: SheetAttributes,
  nRows: number,
  nCols: number,
  clientRowSizes: NumberDict,
  row: number,
  col: number
) => {
  const rowSizes = getRowSizes(sheetAttributes, nRows, clientRowSizes);
  const colSizes = getColSizes(sheetAttributes, nCols);
  return getCellPositionOffset(
    sheetAttributes.rowsHiddenHeaders ?? [],
    sheetAttributes.colsHiddenHeaders ?? [],
    rowSizes,
    colSizes,
    row,
    col
  );
};

const getNewIndices = (
  rows: number[],
  cols: number[],
  allowJump: boolean,
  row: number,
  col: number,
  deltaRow: number,
  deltaColumn: number
) => {
  let newRowIndex = rows.indexOf(row) + deltaRow;
  let newColumnIndex = cols.indexOf(col) + deltaColumn;

  // Only wrap cols for move, not resize.
  if (allowJump) {
    if (newColumnIndex > cols.length - 1) {
      newRowIndex += 1;
      if (newRowIndex < rows.length) newColumnIndex = 0;
    } else if (newColumnIndex < 0) {
      newRowIndex -= 1;
      if (newRowIndex >= 0) newColumnIndex = cols.length - 1;
    }
  }

  newRowIndex = clamp(newRowIndex, 0, rows.length);
  newColumnIndex = clamp(newColumnIndex, 0, cols.length);

  const newRow = rows[newRowIndex];
  const newColumn = cols[newColumnIndex];

  return { newRow, newColumn };
};

export default memo(NeptyneSheetWrapper);
