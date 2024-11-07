import { Component, ReactNode, KeyboardEventHandler, MouseEventHandler } from "react";
import { SheetSelection, SheetLocation } from "../../SheetUtils";

declare namespace ReactDataSheet {
  /** The cell object is what gets passed to the callbacks and events, and contains the basic information about what to show in each cell. You should extend this interface to build a place to store your data.
   * @example
   * interface GridElement extends ReactDataSheet.Cell<GridElement> {
   *      value: number | string | null;
   * }
   */
  export interface Cell<T extends Cell<T, V>, V = string> {
    /** Makes cell unselectable and read only. Default: false. */
    disableEvents?: boolean;
    /** If true, the cell will never go in edit mode. Default: false. */
    readOnly?: boolean;
    /** The rowSpan of the cell's td element. Default: 1. */
    valueViewer?: ValueViewer<T, V>;
  }

  /** Properties of the ReactDataSheet component. */
  export interface DataSheetProps<T extends Cell<T, V>, V = string> {
    /** Optional function or React Component to render each cell element. The default renders a td element. */
    cellRenderer?: CellRenderer<T, V>;
    className?: string;
    /** Array of rows and each row should contain the cell objects to display. */
    data: T[][];
    /** Optional: Avoid Datasheet to listen for clicks on the page */
    disablePageClick?: boolean;
    editing: SheetLocation | {};
    onEditingChange: (editing: SheetLocation | {}) => void;

    onCopy: HandleCopyFunction;
    onPaste: HandleCopyFunction;
    onCut: HandleCopyFunction;
    onNavigate: (
      newRow: number,
      newColumn: number,
      multiSelect: boolean,
      allowJumpRow: boolean
    ) => void;

    /** onCellsChanged handler: function(arrayOfChanges[, arrayOfAdditions]) {}, where changes is an array of objects of the shape {cell, row, col, value}. */
    onCellsChanged?: CellsChangedHandler<T, V>;
    /** Context menu handler : function(event, cell, i, j). */
    onContextMenu?: ContextMenuHandler<T, V>;
    /** Grid default for how to render overflow text in cells. */
    overflow?: "wrap" | "nowrap" | "clip";
    /** Optional. Passing a selection format will make the selection controlled, pass a null for usual behaviour**/
    selected?: SheetSelection | null;
    /** Optional. Calls the function whenever the user changes selection**/
    onSelect?: (selection: OptionalSelection) => void;
    /** Optional. Function to set row key. **/
    keyFn?: (row: number) => string | number;
    /** Optional: Function that can decide whether navigating to the indicated cell is possible. */
    isCellNavigable?: (
      cell: T,
      row: number,
      col: number,
      jumpNext?: boolean
    ) => boolean;
    /** Optional: Is called when datasheet changes edit mode. */
    editModeChanged?: (inEditMode: boolean) => void;
    /** Determines if user can perform a selection without losing focus of edited cell. */
    canSelectWhileEditing?: boolean;
    /** Determines if user is performing a selection without losing focus of edited cell. */
    isSelectingWhileEditing?: boolean;

    cantGoToEditMode: (cell: T) => boolean;

    onSelectWhileEditingStart?: () => void;

    onSelectWhileEditingComplete?: (
      row: number | null,
      col: number | null,
      shouldBeEditing: boolean
    ) => void;

    onSelectWhileEditingAbort?: () => void;
  }

  /** A function to render the value of the cell function(cell, i, j). This is visible by default. To wire it up, pass your function to the valueRenderer property of the ReactDataSheet component. */
  export type ValueRenderer<T extends Cell<T, V>, V = string> = (
    cell: T,
    row: number,
    col: number
  ) => string | number | null | void;

  /** The properties that will be passed to the SheetRenderer component or function. */
  export interface SheetRendererProps<T extends Cell<T, V>, V = string> {
    /** The same data array as from main ReactDataSheet component */
    data: T[][];
    /** Classes to apply to your top-level element. You can add to these, but your should not overwrite or omit them unless you want to implement your own CSS also. */
    className: string;
    /** The regular react props.children. You must render {props.children} within your custom renderer or you won't see your rows and cells. */
    children: ReactNode;
  }

  /** The arguments that will be passed to the first parameter of the onCellsChanged handler function. These represent all the changes _inside_ the bounds of the existing grid. The first generic parameter (required) indicates the type of the cell property, and the second generic parameter (default: string) indicates the type of the value property. */
  export type CellsChangedArgs<T extends Cell<T, V>, V = string> = {
    /** the original cell object you provided in the data property. This may be null */
    cell: T | null;
    /** row index of changed cell */
    row: number;
    /** column index of changed cell */
    col: number;
    /** The new cell value. This is usually a string, but a custom editor may provide any type of value. */
    value: V | null;
  }[];

  /** The arguments that will be passed to the second parameter of the onCellsChanged handler function. These represent all the changes _outside_ the bounds of the existing grid. The  generic parameter (default: string) indicates the type of the value property. */
  export type CellAdditionsArgs<V = string> = {
    row: number;
    col: number;
    value: V | null;
  }[];

  /** onCellsChanged handler: function(arrayOfChanges[, arrayOfAdditions]) {}, where changes is an array of objects of the shape {cell, row, col, value}. To wire it up, pass your function to the onCellsChanged property of the ReactDataSheet component. */
  export type CellsChangedHandler<T extends Cell<T, V>, V = string> = (
    arrayOfChanges: CellsChangedArgs<T, V>,
    arrayOfAdditions?: CellAdditionsArgs<V>
  ) => void;

  /** Context menu handler : function(event, cell, i, j). To wire it up, pass your function to the onContextMenu property of the ReactDataSheet component. */
  export type ContextMenuHandler<T extends Cell<T, V>, V = string> = (
    event: MouseEvent,
    cell: T,
    row: number,
    col: number
  ) => void;

  export type HandleCopyFunction = (e: ClipboardEvent) => void;

  /** The properties that will be passed to the CellRenderer component or function. */
  export interface CellRendererProps<T extends Cell<T, V>, V = string> {
    /** The current row index */
    row: number;
    /** The current column index */
    col: number;
    /** The cell's raw data structure */
    cell: T;
    /** Classes to apply to your cell element. You can add to these, but your should not overwrite or omit them unless you want to implement your own CSS also. */
    className: string;
    /** Generated styles that you should apply to your cell element. This may be null or undefined. */
    style: object | null | undefined;
    /** Is the cell currently selected */
    selected: boolean;
    /** Is the cell currently being edited */
    editing: boolean;
    /** Was the cell recently updated */
    updated: boolean;
    /** Event handler: important for cell selection behavior */
    onMouseDown: MouseEventHandler<HTMLElement>;
    /** Event handler: important for cell selection behavior */
    onMouseOver: MouseEventHandler<HTMLElement>;
    /** Event handler: important for editing */
    onDoubleClick: MouseEventHandler<HTMLElement>;
    /** Event handler: to launch default content-menu handling. You can safely ignore this handler if you want to provide your own content menu handling. */
    onContextMenu: MouseEventHandler<HTMLElement>;
    /** Event handler: important for cell selection behavior */
    onKeyUp: KeyboardEventHandler<HTMLElement>;
    /** The regular react props.children. You must render {props.children} within your custom renderer or you won't your cell's data. */
    children: ReactNode;
  }

  /** A function or React Component to render each cell element. The default renders a td element. To wire it up, pass it to the cellRenderer property of the ReactDataSheet component.  */
  export type CellRenderer<T extends Cell<T, V>, V = string> =
    | React.ComponentClass<CellRendererProps<T, V>>
    | React.SFC<CellRendererProps<T, V>>;

  /** The properties that will be passed to the CellRenderer component or function. */
  export interface ValueViewerProps<T extends Cell<T, V>, V = string> {
    /** The result of the valueRenderer function */
    value: string | number | null;
    /** The current row index */
    row: number;
    /** The current column index */
    col: number;
    /** The cell's raw data structure */
    cell: T;

    onWidgetResize?: (width: number, height: number) => noop;
    onSelectCell?: () => void;
    isCurrentCell?: boolean;
    isReadOnly: boolean;
  }

  /** Optional function or React Component to customize the way the value for each cell in the sheet is displayed. If it is passed to the valueViewer property of the ReactDataSheet component, it affects every cell in the sheet. Different editors can also be passed to the valueViewer property of each Cell to control each cell separately. */
  export type ValueViewer<T extends Cell<T, V>, V = string> =
    | React.ComponentClass<ValueViewerProps<T, V>>
    | React.FC<ValueViewerProps<T, V>>;

  /** The properties that will be passed to the DataEditor component or function. */
  export interface DataEditorProps<T, V = string> {
    /** The result of the dataRenderer (or valueRenderer if none) */
    value: string | number | null;
    /** The current row index */
    row: number;
    /** The current column index */
    col: number;
    /** The cell's raw data structure */
    cell: T;
    /** A callback for when the user changes the value during editing (for example, each time they type a character into an input). onChange does not indicate the final edited value. It works just like a controlled component in a form. */
    onChange: (newValue: V) => void;
    /** function () {} A no-args callback that you can use to indicate that you want to cancel ongoing edits. As with onCommit, you don't need to worry about this if the default keyboard handling works for your editor. */
    onFinishEditing: (shouldFocusGrid?: boolean) => void;
    /** flag for force reset cell value */
    clearing?: boolean;
    onNavigate: (rowDelta: number, colDelta: number) => void;
  }

  export interface CellReference {
    row: number;
    col: number;
  }

  export interface DataSheetState {
    start?: CellReference;
    end?: CellReference;
    selecting?: boolean;
    forceEdit?: boolean;
    editing?: CellReference;
    clear?: CellReference;
    dragging?: boolean;
  }
}

declare class ReactDataSheet<
  T extends ReactDataSheet.Cell<T, V>,
  V = string
> extends Component<
  ReactDataSheet.DataSheetProps<T, V>,
  ReactDataSheet.DataSheetState
> {
  getSelectedCells: (
    data: T[][],
    start: ReactDataSheet.CellReference,
    end: ReactDataSheet.CellReference
  ) => { cell: T; row: number; col: number }[];
  onMouseOver(row: number, col: number, e?: MouseEvent): void;
  handleCut(e: ClipboardEvent): void;
  handlePaste(e: ClipboardEvent): void;
}

export default ReactDataSheet;
