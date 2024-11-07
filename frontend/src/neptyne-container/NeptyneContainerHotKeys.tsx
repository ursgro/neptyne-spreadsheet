import React, { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { KeyBindingMap, KeyBindingOptions, createKeybindingsHandler } from "tinykeys";
import startCase from "lodash/startCase";

import { SheetSelection, TyneAction } from "../SheetUtils";
import {
  CellAttribute,
  Dimension,
  InsertDeleteContent,
  NumberFormat,
  SheetTransform,
  TextAlign,
  TextStyle,
  VerticalAlign,
} from "../NeptyneProtocol";
import { UndoRedoQueue } from "../UndoRedo";
import { KernelSession } from "../KernelSession";
import { BorderAttribute } from "../components/ToolbarControls/border-handler";
import { hotKeys, shortcutModalHotKeys } from "../hotkeyConstants";
import { ModalReducerAction, useModalDispatch } from "./NeptyneModals";
import { LinkDialog } from "../components/ToolbarControls/LinkDialog";
import { NoteDialog } from "../components/ToolbarControls/NoteDialog";
import { OpenTyneDialogDataWrapper } from "../components/OpenDialog/OpenTyneDialogDataWrapper";
import { DEFAULT_DATE_FORMAT, DEFAULT_TIME_FORMAT } from "../datetimeConstants";
import { HOTKEY_BLACKLIST, ShortcutModal } from "../ShortcutModal/ShortcutModal";
import { getCharacterFromKeyCode, withDuplicatedShortcuts } from "./shortcuts";

function tinykeys(
  target: Window | HTMLElement,
  keyBindingMap: KeyBindingMap,
  options: KeyBindingOptions = {}
): () => void {
  let event = options.event ?? "keydown";
  let onKeyEvent = createKeybindingsHandler(keyBindingMap, options);

  target.addEventListener(event, onKeyEvent);

  return () => {
    target.removeEventListener(event, onKeyEvent);
  };
}

interface NeptyneContainerHotKeysProps {
  isModalOpen: boolean;
  onDownload: (fmt: string) => void;
  undoRedo: UndoRedoQueue;
  kernelSession: KernelSession;
  sheetSelection: SheetSelection;
  onToggleSheet: (d: number) => void;
  onNewSheet: () => void;
  onSelectionAttributeChange: (
    attributeName: CellAttribute,
    value: string | undefined
  ) => void;
  onClearCells: () => void;
  onUpdateCellBorders: (cellAttribute: CellAttribute, attributeValue: string) => void;
  onOpenHyperlink: () => void;
  onHandleHeaderResize: (dimension: Dimension) => void;
  onHandleHeaderUnhide: (dimension: Dimension) => void;
  onRowSelection: (row: number, shiftPressed: boolean) => void;
  onColSelection: (col: number, shiftPressed: boolean) => void;
  onTyneAction: (action: TyneAction, payload?: string | File) => void;
  onSearchStart: () => void;
  onEscape: () => void;
  onIncreaseFontSize: () => void;
  onDecreaseFontSize: () => void;
  onToggleShowGridlines: () => void;
  onClearCellFormatting: () => void;
  onCurrentRowsAutosize: () => void;
  onCurrentColsAutosize: () => void;
  onAddSheet: () => void;
  onDeleteSheet: () => void;
  onRenameSheet: () => void;
  onFontChange: () => void;
  onFontColorChange: () => void;
  onBackgroundColorChange: () => void;
  onToggleMergeCells: () => void;
  onSelectAll: () => void;
}

const NeptyneContainerHotKeysRaw: React.FunctionComponent<
  NeptyneContainerHotKeysProps
> = (props) => {
  const {
    onDownload,
    undoRedo,
    kernelSession,
    sheetSelection,
    onToggleSheet,
    onNewSheet,
    onSelectionAttributeChange,
    onClearCells,
    onUpdateCellBorders,
    onOpenHyperlink,
    onHandleHeaderResize,
    onHandleHeaderUnhide,
    onRowSelection,
    onColSelection,
    onTyneAction,
    onSearchStart,
    onEscape,
    onIncreaseFontSize,
    onDecreaseFontSize,
    isModalOpen,
    onToggleShowGridlines,
    onClearCellFormatting,
    onCurrentRowsAutosize,
    onCurrentColsAutosize,
    onAddSheet,
    onDeleteSheet,
    onRenameSheet,
    onFontChange,
    onFontColorChange,
    onBackgroundColorChange,
    onToggleMergeCells,
    onSelectAll,
  } = props;

  const timeoutRef = useRef<number>();

  // intercept key codes to match with key bindings
  const interceptedKeystrokesRef = useRef("");

  // intercept characters to match with shortcut name
  const interceptedStringRef = useRef("");
  const openShortcutModal = useRef<() => void>();

  const catchInterceptedKeys = useCallback((e: KeyboardEvent) => {
    if (![...HOTKEY_BLACKLIST, "Backspace"].includes(e.code)) {
      const hotkeySearchQueryArr = interceptedKeystrokesRef.current.split("+");
      interceptedKeystrokesRef.current = hotkeySearchQueryArr.concat(e.code).join("+");

      interceptedStringRef.current += getCharacterFromKeyCode(e.code);

      if (openShortcutModal.current && timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = window.setTimeout(openShortcutModal.current, 400);
      }
    }
  }, []);

  const modalDispatch = useModalDispatch();
  const cursorRef = useRef(sheetSelection.start);

  useEffect(() => {
    cursorRef.current = sheetSelection.start;
  }, [sheetSelection.start]);

  const selectionRef = useRef(sheetSelection);

  useEffect(() => {
    selectionRef.current = sheetSelection;
  }, [sheetSelection]);

  const handleInsertDeleteContent = useCallback(
    (content: InsertDeleteContent) => {
      const msg = kernelSession.insertDeleteCells(content);
      undoRedo.prepareUndo(msg, sheetSelection);
    },
    [kernelSession, sheetSelection, undoRedo]
  );

  const handleHideHeader = useCallback(
    (dimension: Dimension) => {
      onHandleHeaderResize(dimension);
    },
    [onHandleHeaderResize]
  );

  const handleUnHideHeader = useCallback(
    (dimension: Dimension) => {
      onHandleHeaderUnhide(dimension);
    },
    [onHandleHeaderUnhide]
  );

  const keyBinding = useMemo(() => {
    const handleInsertRowBefore = (event: KeyboardEvent) => {
      event.preventDefault();
      handleInsertDeleteContent({
        sheetTransform: SheetTransform.InsertBefore,
        dimension: Dimension.Row,
        selectedIndex: cursorRef.current.row,
      });
    };

    const handleInsertColumnBefore = (event: KeyboardEvent) => {
      event.preventDefault();
      handleInsertDeleteContent({
        sheetTransform: SheetTransform.InsertBefore,
        dimension: Dimension.Col,
        selectedIndex: cursorRef.current.col,
      });
    };

    const handleInsertRowAfter = (event: KeyboardEvent) => {
      event.preventDefault();
      handleInsertDeleteContent({
        sheetTransform: SheetTransform.InsertBefore,
        dimension: Dimension.Row,
        selectedIndex: cursorRef.current.row + 1,
      });
    };

    const handleInsertColumnAfter = (event: KeyboardEvent) => {
      event.preventDefault();
      handleInsertDeleteContent({
        sheetTransform: SheetTransform.InsertBefore,
        dimension: Dimension.Col,
        selectedIndex: cursorRef.current.col + 1,
      });
    };

    const handleDeleteRow = (event: KeyboardEvent) => {
      event.preventDefault();
      handleInsertDeleteContent({
        sheetTransform: SheetTransform.Delete,
        dimension: Dimension.Row,
        selectedIndex: cursorRef.current.row,
      });
    };

    const handleDeleteColumn = (event: KeyboardEvent) => {
      event.preventDefault();
      handleInsertDeleteContent({
        sheetTransform: SheetTransform.Delete,
        dimension: Dimension.Col,
        selectedIndex: cursorRef.current.col,
      });
    };

    const clearCells = (event: KeyboardEvent) => {
      if (
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        onClearCells();
      }
    };

    const globalKeyBindings: KeyBindingMap = {
      [hotKeys.download]: () => onDownload("json"),
      [hotKeys.undo]: () => undoRedo.undo(),
      [hotKeys.redo]: () => undoRedo.redo(),
      [hotKeys.createNewTyne]: () => onTyneAction(TyneAction.New),
      [hotKeys.openTyne]: () =>
        modalDispatch({
          action: ModalReducerAction.Show,
          props: {
            element: OpenTyneDialogDataWrapper,
          },
        }),
      [hotKeys.startSearch]: onSearchStart,
    };

    const sheetKeyBindings: KeyBindingMap = {
      [hotKeys.insertRowBefore]: handleInsertRowBefore,
      [hotKeys.insertColumnBefore]: handleInsertColumnBefore,
      [hotKeys.insertRowAfter]: handleInsertRowAfter,
      [hotKeys.insertColumnAfter]: handleInsertColumnAfter,
      [hotKeys.deleteRow]: handleDeleteRow,
      [hotKeys.deleteColumn]: handleDeleteColumn,
      [hotKeys.selectRow]: () => onRowSelection(selectionRef.current.end.row, true),
      [hotKeys.selectColumn]: () => onColSelection(selectionRef.current.end.col, true),
      [hotKeys.selectAll]: onSelectAll,
      [hotKeys.scrollSheetDown]: () => onToggleSheet(1),
      [hotKeys.scrollSheetUp]: () => onToggleSheet(-1),
      [hotKeys.createNewSheet]: onNewSheet,
      [hotKeys.formatAsFloat]: () =>
        onSelectionAttributeChange(CellAttribute.NumberFormat, NumberFormat.Float),
      [hotKeys.formatAsTime]: () =>
        onSelectionAttributeChange(
          CellAttribute.NumberFormat,
          `${NumberFormat.Date}-${DEFAULT_TIME_FORMAT}`
        ),
      [hotKeys.formatAsDate]: () =>
        onSelectionAttributeChange(
          CellAttribute.NumberFormat,
          `${NumberFormat.Date}-${DEFAULT_DATE_FORMAT}`
        ),
      [hotKeys.formatAsCurrency]: () =>
        onSelectionAttributeChange(CellAttribute.NumberFormat, NumberFormat.Money),
      [hotKeys.formatAsPercentage]: () =>
        onSelectionAttributeChange(CellAttribute.NumberFormat, NumberFormat.Percentage),
      [hotKeys.bold]: () =>
        onSelectionAttributeChange(CellAttribute.TextStyle, TextStyle.Bold),
      [hotKeys.italic]: () =>
        onSelectionAttributeChange(CellAttribute.TextStyle, TextStyle.Italic),
      [hotKeys.underline]: () =>
        onSelectionAttributeChange(CellAttribute.TextStyle, TextStyle.Underline),
      [hotKeys.clearCells]: clearCells,
      [hotKeys.clearCellsBackspace]: clearCells,
      [hotKeys.clearCellsDelete]: clearCells,
      [hotKeys.alignTextCenter]: () =>
        onSelectionAttributeChange(CellAttribute.TextAlign, TextAlign.Center),
      [hotKeys.alignTextLeft]: () =>
        onSelectionAttributeChange(CellAttribute.TextAlign, TextAlign.Left),
      [hotKeys.alignTextRight]: () =>
        onSelectionAttributeChange(CellAttribute.TextAlign, TextAlign.Right),
      [hotKeys.toggleBorderTop]: () =>
        onUpdateCellBorders(CellAttribute.Border, BorderAttribute.Top),
      [hotKeys.toggleBorderRight]: () =>
        onUpdateCellBorders(CellAttribute.Border, BorderAttribute.Right),
      [hotKeys.toggleBorderBottom]: () =>
        onUpdateCellBorders(CellAttribute.Border, BorderAttribute.Bottom),
      [hotKeys.toggleBorderLeft]: () =>
        onUpdateCellBorders(CellAttribute.Border, BorderAttribute.Left),
      [hotKeys.clearBorder]: () =>
        onUpdateCellBorders(CellAttribute.Border, BorderAttribute.Clear),
      [hotKeys.toggleOuterBorder]: () =>
        onUpdateCellBorders(CellAttribute.Border, BorderAttribute.Outer),
      [hotKeys.toggleOuterBorderCtrl]: () =>
        onUpdateCellBorders(CellAttribute.Border, BorderAttribute.Outer),
      [hotKeys.openHyperlink]: onOpenHyperlink,
      [hotKeys.hideRowHeader]: () => handleHideHeader(Dimension.Row),
      [hotKeys.hideColumnHeader]: () => handleHideHeader(Dimension.Col),
      [hotKeys.showRowHeader]: () => handleUnHideHeader(Dimension.Row),
      [hotKeys.showColumnHeader]: () => handleUnHideHeader(Dimension.Col),
      [hotKeys.addLink]: () =>
        modalDispatch({
          action: ModalReducerAction.Show,
          props: {
            element: LinkDialog,
          },
        }),
      [hotKeys.editNote]: () =>
        modalDispatch({
          action: ModalReducerAction.Show,
          props: {
            element: NoteDialog,
          },
        }),
      // Platform-specific hotkeys
      [hotKeys.platformInsertRowBefore]: handleInsertRowBefore,
      [hotKeys.platformInsertColumnBefore]: handleInsertColumnBefore,
      [hotKeys.platformInsertRowAfter]: handleInsertRowAfter,
      [hotKeys.platformInsertColumnAfter]: handleInsertColumnAfter,
      [hotKeys.platformDeleteRow]: handleDeleteRow,
      [hotKeys.platformDeleteColumn]: handleDeleteColumn,
      [hotKeys.escape]: onEscape,
      [hotKeys.increaseFontSize]: onIncreaseFontSize,
      [hotKeys.decreaseFontSize]: onDecreaseFontSize,
      [shortcutModalHotKeys.setBackgroundColor]: onBackgroundColorChange,
      [shortcutModalHotKeys.setFontColor]: onFontColorChange,
      [shortcutModalHotKeys.renameSheet]: onRenameSheet,
      [shortcutModalHotKeys.addSheet]: onAddSheet,
      [shortcutModalHotKeys.deleteSheet]: onDeleteSheet,
      [shortcutModalHotKeys.showGridlines]: onToggleShowGridlines,
      [shortcutModalHotKeys.toggleBorderBottom]: () =>
        onUpdateCellBorders(CellAttribute.Border, BorderAttribute.Bottom),
      [shortcutModalHotKeys.toggleBorderLeft]: () =>
        onUpdateCellBorders(CellAttribute.Border, BorderAttribute.Left),
      [shortcutModalHotKeys.toggleBorderTop]: () =>
        onUpdateCellBorders(CellAttribute.Border, BorderAttribute.Top),
      [shortcutModalHotKeys.toggleBorderRight]: () =>
        onUpdateCellBorders(CellAttribute.Border, BorderAttribute.Right),
      [shortcutModalHotKeys.bordersAll]: () =>
        onUpdateCellBorders(CellAttribute.Border, BorderAttribute.All),
      [shortcutModalHotKeys.bordersOutside]: () =>
        onUpdateCellBorders(CellAttribute.Border, BorderAttribute.Outer),
      [shortcutModalHotKeys.alignTextLeft]: () =>
        onSelectionAttributeChange(CellAttribute.TextAlign, TextAlign.Left),
      [shortcutModalHotKeys.alignTextCenter]: () =>
        onSelectionAttributeChange(CellAttribute.TextAlign, TextAlign.Center),
      [shortcutModalHotKeys.alignTextRight]: () =>
        onSelectionAttributeChange(CellAttribute.TextAlign, TextAlign.Right),
      [shortcutModalHotKeys.alignTextBottom]: () =>
        onSelectionAttributeChange(CellAttribute.VerticalAlign, VerticalAlign.Bottom),
      [shortcutModalHotKeys.alignTextMiddle]: () =>
        onSelectionAttributeChange(CellAttribute.VerticalAlign, VerticalAlign.Middle),
      [shortcutModalHotKeys.alignTextTop]: () =>
        onSelectionAttributeChange(CellAttribute.VerticalAlign, VerticalAlign.Top),
      [shortcutModalHotKeys.clearCellFormatting]: onClearCellFormatting,
      [shortcutModalHotKeys.changeCellFont]: onFontChange,
      [shortcutModalHotKeys.autofitCellWidth]: onCurrentColsAutosize,
      [shortcutModalHotKeys.autofitCellHeight]: onCurrentRowsAutosize,
      [shortcutModalHotKeys.bold]: () =>
        onSelectionAttributeChange(CellAttribute.TextStyle, TextStyle.Bold),
      [hotKeys.mergeCells]: onToggleMergeCells,
      Alt: () => false,
    };

    const setupKeyHandler = (
      handler: (event: KeyboardEvent) => void,
      gridOnly: boolean
    ) => {
      return (e: KeyboardEvent) => {
        if (
          gridOnly &&
          !document
            .getElementById("inner-sheet_container")
            ?.contains(e.target as HTMLElement) &&
          (e.target as HTMLElement).id !== "shortcut-modal-search"
        ) {
          return;
        }
        e.preventDefault();
        window.removeEventListener("keydown", catchInterceptedKeys);
        timeoutRef.current && clearTimeout(timeoutRef.current);
        interceptedKeystrokesRef.current = "";
        interceptedStringRef.current = "";
        openShortcutModal.current = undefined;
        timeoutRef.current = undefined;
        return handler(e);
      };
    };

    const resultMap = Object.keys(globalKeyBindings).reduce(
      (newObj, key) => ({
        ...newObj,
        [key]: setupKeyHandler(globalKeyBindings[key], false),
      }),
      globalKeyBindings
    );

    Object.assign(
      resultMap,
      Object.keys(sheetKeyBindings).reduce(
        (newObj, key) => ({
          ...newObj,
          [key]: setupKeyHandler(sheetKeyBindings[key], true),
        }),
        sheetKeyBindings
      )
    );

    return resultMap;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoRedo.queue]);

  const modalKeyBinding = useMemo(
    () =>
      withDuplicatedShortcuts({
        ...keyBinding,
        [hotKeys.openShortcutModal]: (e: KeyboardEvent) => {
          window.addEventListener("keydown", catchInterceptedKeys);
          openShortcutModal.current = () => {
            e.preventDefault();
            modalDispatch({
              action: ModalReducerAction.Show,
              props: {
                element: ShortcutModal,
                elementProps: {
                  startHotkeySearchQuery: interceptedKeystrokesRef.current,
                  startSearchQuery: interceptedStringRef.current,
                  shortcutItems: Object.entries(hotKeys)
                    .filter(([key]) => key !== hotKeys.openShortcutModal)
                    .concat(Object.entries(shortcutModalHotKeys))
                    .map(([key, value]) => ({
                      shortcut: value,
                      name: startCase(key),
                      callback: keyBinding[value],
                    })),
                },
              },
            });
            interceptedKeystrokesRef.current = "";
            interceptedStringRef.current = "";
            window.removeEventListener("keydown", catchInterceptedKeys);
            openShortcutModal.current = undefined;
          };
          timeoutRef.current = window.setTimeout(openShortcutModal.current, 400);
        },
      }),
    [keyBinding, catchInterceptedKeys, modalDispatch]
  );

  useEffect(() => {
    if (!isModalOpen) {
      const unsubscribe = tinykeys(window, modalKeyBinding);
      return () => {
        unsubscribe();
      };
    }
  }, [modalKeyBinding, isModalOpen]);

  return null;
};

export const NeptyneContainerHotKeys = memo(NeptyneContainerHotKeysRaw);
NeptyneContainerHotKeys.displayName = "NeptyneContainerHotKeys";
