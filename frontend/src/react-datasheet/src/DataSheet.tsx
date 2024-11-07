import React, { PureComponent } from "react";
import {
  DOWN_KEY,
  ENTER_KEY,
  ESCAPE_KEY,
  LEFT_KEY,
  RIGHT_KEY,
  TAB_KEY,
  UP_KEY,
} from "./keys";
import { GridElement, SheetLocation, SheetSelection } from "../../SheetUtils";
import ReactDataSheet from "../types/react-datasheet";
import { NeptyneSheetRenderer } from "../../neptyne-sheet/NeptyneSheetRenderer";
import memoizeOne from "memoize-one";
import isEmpty from "lodash/isEmpty";
import { isMacOs } from "react-device-detect";
import { flushSync } from "react-dom";

export const isValidCoordinate = <T,>(coord: T | {} | undefined): coord is T =>
  !!coord && !isEmpty(coord);

export const range = (start: number, end: number): number[] => {
  const array = [];
  const inc = end - start > 0;
  for (let i = start; inc ? i <= end : i >= end; inc ? i++ : i--) {
    inc ? array.push(i) : array.unshift(i);
  }
  return array;
};

type DataSheetCoordinate = { row: number; col: number };

interface DataSheetState {
  start: DataSheetCoordinate;
  end: DataSheetCoordinate;
  selecting: boolean;
  forceEdit: boolean;
  clear: DataSheetCoordinate | {};
  dragging: boolean;
}

interface DataSheetProps extends ReactDataSheet.DataSheetProps<GridElement> {
  isCopyingFormat: boolean;
  onCopyFormat: (selection: SheetSelection) => void;
  onNavigate: (
    newRow: number,
    newColumn: number,
    multiSelect: boolean,
    allowJumpRow: boolean
  ) => void;
  onCut: (event: ClipboardEvent) => void;
  onBlur: () => void;
  onInitiateClear: (loc: SheetLocation) => void;
  hideScrollbars?: boolean;
}

export default class DataSheet extends PureComponent<DataSheetProps, DataSheetState> {
  defaultState: DataSheetState;
  dgDom?: HTMLSpanElement | null;

  constructor(props: Readonly<DataSheetProps>) {
    super(props);
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onMouseOver = this.onMouseOver.bind(this);
    this.onDoubleClick = this.onDoubleClick.bind(this);
    this.onContextMenu = this.onContextMenu.bind(this);
    this.handleNavigate = this.handleNavigate.bind(this);
    this.handleKey = this.handleKey.bind(this).bind(this);
    this.handleCut = this.handleCut.bind(this);
    this.handleCopy = this.handleCopy.bind(this);
    this.handlePaste = this.handlePaste.bind(this);
    this.pageClick = this.pageClick.bind(this);
    this.onChange = this.onChange.bind(this);
    this.onFinishEditing = this.onFinishEditing.bind(this);
    this.handleComponentKey = this.handleComponentKey.bind(this);

    this.handleKeyboardCellMovementFromEvent =
      this.handleKeyboardCellMovementFromEvent.bind(this);

    this.defaultState = {
      start: { row: 0, col: 0 },
      end: { row: 0, col: 0 },
      selecting: false,
      forceEdit: false,
      clear: {},
      dragging: false,
    };
    this.state = this.defaultState;

    this.removeAllListeners = this.removeAllListeners.bind(this);
  }

  focusOnRootElement() {
    this.dgDom?.focus();
  }

  setAutofillDraggingState(dragging: boolean) {
    this.setState({
      dragging,
    });
  }

  removeAllListeners() {
    document.removeEventListener("mousedown", this.pageClick);
    document.removeEventListener("mouseup", this.onMouseUp);
    document.removeEventListener("cut", this.handleCut);
    document.removeEventListener("copy", this.handleCopy);
    document.removeEventListener("paste", this.handlePaste);
  }

  componentDidMount() {
    // Add listener scoped to the DataSheet that catches otherwise unhandled
    // keyboard events when displaying components
    this.dgDom && this.dgDom.addEventListener("keydown", this.handleComponentKey);
  }

  componentWillUnmount() {
    this.dgDom && this.dgDom.removeEventListener("keydown", this.handleComponentKey);
    this.removeAllListeners();
  }

  getState() {
    let state = this.state;
    let { start, end } = this.props.selected || {};
    start = start || this.defaultState.start;
    end = end || this.defaultState.end;
    state = { ...state, start, end };
    return state;
  }

  _setState(state: Partial<DataSheetState>) {
    if ("start" in state || "end" in state) {
      let { start, end, ...rest } = state;
      let { onSelect } = this.props;
      onSelect && onSelect({ start, end });

      // we need to figure out how to guarantee "default" values for non-nullable state objects
      // @ts-ignore
      this.setState(rest);
    } else {
      // we need to figure out how to guarantee "default" values for non-nullable state objects
      // @ts-ignore
      this.setState(state);
    }
  }

  pageClick(e: MouseEvent) {
    if (this.props.disablePageClick) return;
    const element = this.dgDom;
    if (element && !element.contains(e.target as Node)) {
      this.setState(this.defaultState);
      this.removeAllListeners();
    }
  }

  handleCut(e: ClipboardEvent) {
    this.props.onCut(e);
  }

  handleCopy(e: ClipboardEvent) {
    this.props.onCopy(e);
  }

  handlePaste(e: ClipboardEvent) {
    this.props.onPaste(e);
  }

  handleKeyboardCellMovementFromEvent(e: React.KeyboardEvent, commit = false) {
    const { isSelectingWhileEditing, editing } = this.props;
    const isEditing = editing && !isEmpty(editing);

    if (isEditing && !isSelectingWhileEditing && !commit) {
      return;
    }

    const keyCode = e.which || e.keyCode;

    const isSubmitEnter = keyCode === ENTER_KEY && !(e.metaKey || e.ctrlKey);

    // TAB is a special one because we can use it both for navigation and for data submit.
    // since cell-id edit mode combines both, we have to "mute" TAB handling here
    if (!isSelectingWhileEditing && keyCode === TAB_KEY) {
      e.preventDefault();
      this.handleNavigate(
        e.nativeEvent,
        { row: 0, col: e.shiftKey ? -1 : 1 },
        true,
        false
      );
    } else if (commit && isSubmitEnter) {
      this.handleNavigate(
        e.nativeEvent,
        { row: e.shiftKey ? -1 : 1, col: 0 },
        true,
        false
      );
    } else {
      this.handleArrowKey(e);
    }
  }

  handleArrowKey(e: React.KeyboardEvent) {
    const keyCode = e.which || e.keyCode;
    if (isMacOs ? e.metaKey : e.ctrlKey) return;

    if (keyCode === RIGHT_KEY) {
      this.handleNavigate(e.nativeEvent, { row: 0, col: 1 }, false, false);
    } else if (keyCode === LEFT_KEY) {
      this.handleNavigate(e.nativeEvent, { row: 0, col: -1 }, false, false);
    } else if (keyCode === UP_KEY) {
      this.handleNavigate(e.nativeEvent, { row: -1, col: 0 }, false, false);
    } else if (keyCode === DOWN_KEY) {
      this.handleNavigate(e.nativeEvent, { row: 1, col: 0 }, false, false);
    }
  }

  handleKey(e: React.KeyboardEvent) {
    if (e.isPropagationStopped && e.isPropagationStopped()) {
      return;
    }
    const keyCode = e.which || e.keyCode;
    const { start } = this.getState();
    const {
      isSelectingWhileEditing,
      canSelectWhileEditing,
      editing,
      onSelectWhileEditingStart,
    } = this.props;
    const noCellsSelected = !start || isEmpty(start);
    const ctrlKeyPressed = e.ctrlKey || e.metaKey;
    const altKeyPressed = e.altKey;
    const isSubmitEnter = keyCode === ENTER_KEY && !(e.metaKey || e.ctrlKey);
    const shiftKeyPressed = e.shiftKey;
    const numbersPressed = keyCode >= 48 && keyCode <= 57;
    const lettersPressed = keyCode >= 65 && keyCode <= 90;
    const latin1Supplement = keyCode >= 160 && keyCode <= 255;
    const numPadKeysPressed = keyCode >= 96 && keyCode <= 105;
    const currentCell = !noCellsSelected && this.props.data?.[start.row]?.[start.col];
    const equationKeysPressed =
      [
        187 /* equal */, 189 /* substract */, 190 /* period */, 107 /* add */,
        109 /* decimal point */, 110,
      ].indexOf(keyCode) > -1;

    if (noCellsSelected || ctrlKeyPressed) {
      return true;
    }

    if (!isValidCoordinate(editing) || isSelectingWhileEditing) {
      this.handleKeyboardCellMovementFromEvent(e);
      if (currentCell && !this.props.cantGoToEditMode(currentCell)) {
        if (isSubmitEnter && !altKeyPressed && !isSelectingWhileEditing && !e.ctrlKey) {
          this.props.onEditingChange({ row: start.row, col: start.col });
          this._setState({ clear: {}, forceEdit: true });
          e.preventDefault();
        } else if (
          numbersPressed ||
          numPadKeysPressed ||
          lettersPressed ||
          latin1Supplement ||
          equationKeysPressed
        ) {
          if (isSelectingWhileEditing) {
            // @ts-ignore
            const { row, col } = editing;
            this.props.onSelectWhileEditingComplete &&
              this.props.onSelectWhileEditingComplete(row, col, true);
            this._setState({ forceEdit: false, selecting: false });
          } else {
            // TODO: prevent enter into edit mode during shortcuts
            if (
              !altKeyPressed &&
              !ctrlKeyPressed &&
              !(shiftKeyPressed && ctrlKeyPressed)
            ) {
              // empty out cell if user starts typing without pressing enter
              this.props.onEditingChange({ row: start.row, col: start.col });
              this.props.onInitiateClear({ row: start.row, col: start.col });

              // flushSync is necessary here so that the rendered codeMirror
              // editor is available to accept the keystroke.
              // TODO: capture the keystroke and apply it to the editor
              flushSync(() => {
                this._setState({ clear: start, forceEdit: false });
              });
            }
          }
        }
      }
    }
    if (
      isValidCoordinate(editing) &&
      canSelectWhileEditing &&
      !isSelectingWhileEditing &&
      [DOWN_KEY, UP_KEY, LEFT_KEY, RIGHT_KEY].includes(keyCode)
    ) {
      onSelectWhileEditingStart && onSelectWhileEditingStart();
      setTimeout(() => {
        this.handleArrowKey(e);
        this.props.onEditingChange(editing);
        this._setState({
          selecting: true,
          forceEdit: false,
        });
        this.dgDom && this.dgDom.focus({ preventScroll: true });
      }, 0);
    }
  }

  handleNavigate(
    e: KeyboardEvent,
    offsets: DataSheetCoordinate,
    forbidMultiSelect: boolean,
    allowJumpRow: boolean
  ) {
    if (offsets && (offsets.row || offsets.col)) {
      const multiSelect = e.shiftKey && !forbidMultiSelect;
      this.props.onNavigate(offsets.row, offsets.col, multiSelect, allowJumpRow);
      e.preventDefault();
    }
  }

  handleComponentKey(e: KeyboardEvent) {
    // handles keyboard events when editing components
    const keyCode = e.which || e.keyCode;
    const isSubmitEnter = keyCode === ENTER_KEY && !(e.metaKey || e.ctrlKey);
    if (![ESCAPE_KEY, TAB_KEY].includes(keyCode) && !isSubmitEnter) {
      return;
    }
    const { editing } = this.props;
    const { data, isSelectingWhileEditing } = this.props;
    const isEditing = isValidCoordinate(editing);
    if (isEditing) {
      const currentCell = data[editing.row][editing.col];
      const offset = e.shiftKey ? -1 : 1;
      if (currentCell && !isSelectingWhileEditing) {
        e.preventDefault();
        let func = this.onFinishEditing; // ESCAPE_KEY
        if (isSubmitEnter) {
          func = () => {
            this.onFinishEditing();
            this.handleNavigate(e, { row: offset, col: 0 }, false, false);
          };
        } else if (keyCode === TAB_KEY) {
          func = () => {
            this.onFinishEditing();
            this.handleNavigate(e, { row: 0, col: offset }, true, true);
          };
        }
        // setTimeout makes sure that component is done handling the event before we take over
        setTimeout(func);
      }
    }
    if (isSelectingWhileEditing) {
      e.preventDefault();
      let func = () => {};
      if (keyCode === ESCAPE_KEY) {
        func = () => {
          this.onFinishEditing();
          this.props.onSelectWhileEditingAbort &&
            this.props.onSelectWhileEditingAbort();
        };
      } else if (isSubmitEnter) {
        func = () => {
          this.props.onSelectWhileEditingComplete &&
            this.props.onSelectWhileEditingComplete(
              isEditing ? editing.row + 1 : null,
              isEditing ? editing.col : null,
              false
            );
        };
      } else if (keyCode === TAB_KEY) {
        func = () => {
          this.props.onSelectWhileEditingComplete &&
            this.props.onSelectWhileEditingComplete(
              isEditing ? editing.row : null,
              isEditing ? editing.col + 1 : null,
              false
            );
        };
      }
      setTimeout(() => {
        this.dgDom && this.dgDom.focus({ preventScroll: true });
        this.props.onEditingChange({});
        this.setState({ selecting: false });
        func();
      }, 1);
    }
  }

  onContextMenu(evt: React.MouseEvent, row: number, col: number) {
    let cell = this.props.data[row][col];
    if (this.props.onContextMenu) {
      this.props.onContextMenu(evt.nativeEvent, cell, row, col);
    }
  }

  onDoubleClick(row: number, col: number) {
    const cell = this.props.data[row][col];
    if (!this.props.cantGoToEditMode(cell) && !this.props.isSelectingWhileEditing) {
      this.props.onEditingChange({ row, col });
      this._setState({ forceEdit: true, clear: {} });
    }
  }

  onMouseDown(row: number, col: number, event?: React.MouseEvent) {
    const { editing } = this.props;
    const isNowEditingSameCell =
      isValidCoordinate(editing) && editing.row === row && editing.col === col;
    const isNowEditingOtherCell =
      isValidCoordinate(editing) && (editing.row !== row || editing.col !== col);
    const newEditing =
      (!isValidCoordinate(editing) || editing.row !== row || editing.col !== col) &&
      !this.props.canSelectWhileEditing
        ? {}
        : editing;

    if (this.props.isSelectingWhileEditing && isNowEditingSameCell) {
      // stop editing and selection if we click on cell that initiated cell selection
      this.props.onSelectWhileEditingComplete &&
        this.props.onSelectWhileEditingComplete(row, col, true);
    } else {
      const stateUpdateObj = {
        selecting: !isNowEditingSameCell,
        start: event?.nativeEvent.shiftKey ? undefined : { row, col },
        end: { row, col },
        forceEdit: isNowEditingSameCell,
      };
      if (isNowEditingOtherCell && this.props.canSelectWhileEditing) {
        // we need to run two separate callbacks for upper component:
        // onSelectWhileEditingStart and onSelect. Both of them update state and it causes
        // conflicts between them.
        // The only solution that worked is wrapping the second callback in setTimeout.

        this.props.onSelectWhileEditingStart && this.props.onSelectWhileEditingStart();

        setTimeout(() => {
          this.props.onEditingChange(newEditing);
          this._setState(stateUpdateObj);
        }, 0);
      } else {
        this.props.onEditingChange(newEditing);
        this._setState(stateUpdateObj);
      }
    }

    // Blur from any selected cell to call their submit handlers
    if (
      isValidCoordinate(editing) &&
      document.activeElement &&
      document.activeElement instanceof HTMLElement &&
      event !== undefined &&
      event.target instanceof HTMLElement &&
      !document.activeElement.contains(event.target)
    ) {
      document.activeElement.blur();
    }

    // Keep listening to mouse if user releases the mouse (dragging outside)
    document.addEventListener("mouseup", this.onMouseUp);
    // Listen for any outside mouse clicks
    document.addEventListener("mousedown", this.pageClick);

    // Cut, copy and paste event handlers
    document.addEventListener("cut", this.handleCut);
    document.addEventListener("copy", this.handleCopy);
    document.addEventListener("paste", this.handlePaste);
  }

  onMouseOver(row: number, col: number, e: React.MouseEvent) {
    if (this.state.dragging) return;

    const isButtonPressed = e && e.nativeEvent.buttons;
    // this.state.selecting works great when keyboard is used for selection,
    // but we have to separately handle selection using mouse
    if (
      (this.state.selecting && isEmpty(this.props.editing)) ||
      (this.props.isSelectingWhileEditing && isButtonPressed)
    ) {
      this._setState({ end: { row: row, col: col } });
    }
  }

  onMouseUp() {
    if (
      this.state.selecting &&
      !this.props.isSelectingWhileEditing &&
      window.getSelection
    ) {
      window.getSelection()?.removeAllRanges();
    }
    this._setState({ selecting: false });
    document.removeEventListener("mouseup", this.onMouseUp);
    if (this.props.isCopyingFormat) {
      const { start, end } = this.getState();
      this.props.onCopyFormat({ start, end });
    }
  }

  onSelectCell = (row: number, col: number): void => {
    this.props.onEditingChange({});
    this._setState({
      selecting: false,
      start: { row: row, col: col },
      end: { row: row, col: col },
    });
  };

  onChange(row: number, col: number, value: GridElement["value"]): void {
    const { onCellsChanged, data } = this.props;
    if (onCellsChanged) {
      onCellsChanged([
        { cell: data[row][col], row, col, value: value as string | null },
      ]);
    }
    this.onFinishEditing();
  }

  onFinishEditing(shouldFocusGrid = true): void {
    this.props.onEditingChange({});
    if (shouldFocusGrid && this.dgDom) {
      this.dgDom.focus({ preventScroll: true });
    }
  }

  getIJEditingCell = memoizeOne((cell: DataSheetProps["editing"]) =>
    isValidCoordinate(cell) ? { row: cell.row, col: cell.col } : {}
  );

  handleNavigateFromDelta = (row: number, col: number) =>
    this.props.onNavigate(row, col, false, true);

  render() {
    const { forceEdit, clear } = this.state;
    return (
      <span
        ref={(r) => {
          this.dgDom = r;
        }}
        tabIndex={0}
        id="data-grid-container"
        data-testid="data-grid-container"
        className="data-grid-container"
        onKeyDown={this.handleKey}
        onBlur={this.props.onBlur}
      >
        <NeptyneSheetRenderer
          editingCell={this.getIJEditingCell(this.props.editing)}
          clearingCell={clear}
          isForcedEdit={forceEdit}
          onNavigate={this.handleNavigateFromDelta}
          onMouseDown={this.onMouseDown}
          onSelectCell={this.onSelectCell}
          onMouseOver={this.onMouseOver}
          onDoubleClick={this.onDoubleClick}
          onContextMenu={this.onContextMenu}
          onChange={this.onChange}
          onFinishEditing={this.onFinishEditing}
          hideScrollbars={this.props.hideScrollbars}
        />
      </span>
    );
  }
}
