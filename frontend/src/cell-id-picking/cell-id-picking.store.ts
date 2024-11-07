import { EditorSelection, EditorStateConfig } from "@codemirror/state";
import { makeAutoObservable } from "mobx";
import { createContext, useContext } from "react";
import {
  canSelectWhileEditing,
  canSelectWhileEditingRepl,
} from "../neptyne-sheet/can-select-while-editing";
import { SheetSelection } from "../SheetUtils";
import { getCellContentWithSelection } from "../SheetUtils";
import { EditorView, ViewUpdate } from "@codemirror/view";

export enum CellIdPickingStatus {
  CanPick = "canPick",
  IsPicking = "isPicking",
  CannotPick = "cannotPick",
}

export type MovementSource = "mouse" | "keyboard";

export interface EditorContent {
  value: string;
  dynamicContentStart: number;
  dynamicContentEnd: number;
  editorSelection: EditorStateConfig["selection"];
  lastUserMovementSource?: MovementSource;
}

export class CellIdPickingStore implements EditorContent {
  value = "";
  dynamicContentStart = 0;
  dynamicContentEnd = 0;
  editorSelection: EditorStateConfig["selection"] = EditorSelection.single(0);
  cellIdPickingStatus = CellIdPickingStatus.CanPick;
  currentEditorView: EditorView | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  handleFocus(view: EditorView) {
    this.currentEditorView = view;
    this.value = view.state.doc.toString();
    this.editorSelection = view.state.selection;
    this.dynamicContentStart = view.state.selection.main.head;
    this.dynamicContentEnd = view.state.selection.main.head;
    const getStatus =
      this.currentEditorView?.dom.parentElement?.id === "repl-editor"
        ? canSelectWhileEditingRepl
        : canSelectWhileEditing;
    this.cellIdPickingStatus = getStatus(
      view.state.doc.toString(),
      view.state.selection.main.head,
      false
    )
      ? CellIdPickingStatus.CanPick
      : CellIdPickingStatus.CannotPick;
  }

  handleValueChangeFromProps(
    value: string,
    editorSelection: EditorStateConfig["selection"],
    cursorPosition: number
  ) {
    if (this.cellIdPickingStatus !== CellIdPickingStatus.IsPicking) {
      this.value = value;
      this.editorSelection = editorSelection;
      this.dynamicContentStart = cursorPosition;
      this.dynamicContentEnd = cursorPosition;
      const getStatus =
        this.currentEditorView?.dom.parentElement?.id === "repl-editor"
          ? canSelectWhileEditingRepl
          : canSelectWhileEditing;
      this.cellIdPickingStatus = getStatus(value, cursorPosition, false)
        ? CellIdPickingStatus.CanPick
        : CellIdPickingStatus.CannotPick;
    }
  }

  handleValueChange(viewUpdate: ViewUpdate) {
    if (this.cellIdPickingStatus !== CellIdPickingStatus.IsPicking) {
      this.value = viewUpdate.state.doc.toString();
      this.editorSelection = viewUpdate.state.selection;
      this.dynamicContentStart = viewUpdate.state.selection.main.head;
      this.dynamicContentEnd = viewUpdate.state.selection.main.head;
      const getStatus =
        this.currentEditorView?.dom.parentElement?.id === "repl-editor"
          ? canSelectWhileEditingRepl
          : canSelectWhileEditing;
      this.cellIdPickingStatus = getStatus(
        viewUpdate.state.doc.toString(),
        viewUpdate.state.selection.main.head,
        false
      )
        ? CellIdPickingStatus.CanPick
        : CellIdPickingStatus.CannotPick;
    }
  }

  handleCellIdPicking(selection: SheetSelection, sheetName?: string) {
    if (
      !!this.currentEditorView &&
      this.cellIdPickingStatus !== CellIdPickingStatus.CannotPick
    ) {
      const newValue = getCellContentWithSelection(this, selection, sheetName);
      this.value = newValue.value;
      this.editorSelection = newValue.editorSelection;
      this.dynamicContentEnd = newValue.dynamicContentEnd;
      this.cellIdPickingStatus = CellIdPickingStatus.IsPicking;
    }
  }

  handleSheetBlur() {
    this.cellIdPickingStatus =
      this.cellIdPickingStatus === CellIdPickingStatus.IsPicking
        ? CellIdPickingStatus.CanPick
        : this.cellIdPickingStatus;
  }

  handleCellIdPickingAbort() {
    const revertedValue =
      this.value.substr(0, this.dynamicContentStart) +
      this.value.substr(this.dynamicContentEnd);
    const getStatus =
      this.currentEditorView?.dom.parentElement?.id === "repl-editor"
        ? canSelectWhileEditingRepl
        : canSelectWhileEditing;
    this.cellIdPickingStatus = getStatus(revertedValue, this.dynamicContentStart, false)
      ? CellIdPickingStatus.CanPick
      : CellIdPickingStatus.CannotPick;
    this.value = revertedValue;
    this.dynamicContentEnd = revertedValue.length;
    this.dynamicContentStart = revertedValue.length;
    this.editorSelection = EditorSelection.single(this.dynamicContentStart);
  }

  handleReplCellIdPickingComplete() {
    this.currentEditorView?.focus();
    const getStatus =
      this.currentEditorView?.dom.parentElement?.id === "repl-editor"
        ? canSelectWhileEditingRepl
        : canSelectWhileEditing;
    this.cellIdPickingStatus = getStatus(this.value, this.dynamicContentStart)
      ? CellIdPickingStatus.CanPick
      : CellIdPickingStatus.CannotPick;
    this.dynamicContentEnd = this.value.length;
    this.dynamicContentStart = this.value.length;
    this.editorSelection = EditorSelection.single(this.dynamicContentEnd);
  }
}

export const cellIdPickingStore = new CellIdPickingStore();

export const CellIdPickingContext = createContext<CellIdPickingStore | null>(null);

export const useCellIdPickingContext = (): CellIdPickingStore => {
  const value = useContext(CellIdPickingContext);
  if (!value) {
    throw new Error("useCellIdPickingContext must be used within CellIdPickingContext");
  }
  return value;
};
