/**
 * This test might look a bit verbose, but there is a reason for it.
 *
 * Here we achieve two main things:
 *
 * 1. We make sure all the active properties of NeptyneContainerHotKeys are tested. As soon as
 * someone adds a new prop to NeptyneContainerHotKeys, TypeScript will throw errors in this
 * test until this prop is added here.
 *
 * 2. We make sure all the hotkeys are listed here. If someone adds a new entry to hotKeys object,
 * TypeScript will throw errors in this test until this hotkey is added here. It is okay to Omit
 * some hotkeys, since not all of them are used in NeptyneContainerHotKeys.
 *
 * I tried to write this test in a more generic and less verbose way, but I never could achieve
 * helpful and restrictive type-checking.
 */
import { act, render } from "@testing-library/react";
import { NeptyneContainerHotKeys } from "./NeptyneContainerHotKeys";
import { UndoRedoQueue } from "../UndoRedo";
import { KernelSession } from "../KernelSession";
import { ModalContext, ModalReducerAction } from "./NeptyneModals";
import userEvent from "@testing-library/user-event";
import { hotKeys } from "../hotkeyConstants";
import {
  CellAttribute,
  Dimension,
  NumberFormat,
  SheetTransform,
  TextAlign,
  TextStyle,
} from "../NeptyneProtocol";
import { DEFAULT_DATE_FORMAT, DEFAULT_TIME_FORMAT } from "../datetimeConstants";
import { BorderAttribute } from "../components/ToolbarControls/border-handler";
import { LinkDialog } from "../components/ToolbarControls/LinkDialog";
import { NoteDialog } from "../components/ToolbarControls/NoteDialog";
import { ShortcutModal } from "../ShortcutModal/ShortcutModal";
import { TyneAction } from "../SheetUtils";
import { OpenTyneDialogDataWrapper } from "../components/OpenDialog/OpenTyneDialogDataWrapper";

const getShortcutMocks = () => ({
  onSelectionAttributeChange: jest.fn(),
  onDownload: jest.fn(),
  onCodeAssist: jest.fn(),
  onToggleSheet: jest.fn(),
  onNewSheet: jest.fn(),
  onClearCells: jest.fn(),
  onUpdateCellBorders: jest.fn(),
  onOpenHyperlink: jest.fn(),
  onHandleHeaderResize: jest.fn(),
  onHandleHeaderUnhide: jest.fn(),
  onRowSelection: jest.fn(),
  onToggleMergeCells: jest.fn(),
  onColSelection: jest.fn(),
  onTyneAction: jest.fn(),
  onSearchStart: jest.fn(),
  onEscape: jest.fn(),
  onIncreaseFontSize: jest.fn(),
  onDecreaseFontSize: jest.fn(),
  onToggleShowGridlines: jest.fn(),
  onClearCellFormatting: jest.fn(),
  onCurrentRowsAutosize: jest.fn(),
  onCurrentColsAutosize: jest.fn(),
  onAddSheet: jest.fn(),
  onDeleteSheet: jest.fn(),
  onRenameSheet: jest.fn(),
  onFontChange: jest.fn(),
  onFontColorChange: jest.fn(),
  onBackgroundColorChange: jest.fn(),
  onSelectAll: jest.fn(),
  onShowResourceUsage: jest.fn(),
  undoRedo: new UndoRedoQueue(jest.fn(), jest.fn()),
  kernelSession: new KernelSession(),
});

type HotKeys = typeof hotKeys;

const getShortcutConfig = () => {
  const props = getShortcutMocks();
  const modalDispatch = jest.fn();
  const undoMock = jest.spyOn(props.undoRedo, "undo");
  const redoMock = jest.spyOn(props.undoRedo, "redo");

  const insertDeleteCellsMock = jest.spyOn(props.kernelSession, "insertDeleteCells");

  const checks: {
    [Property in keyof Omit<
      HotKeys,
      | "insertRowBefore"
      | "insertColumnBefore"
      | "insertRowAfter"
      | "insertColumnAfter"
      | "deleteRow"
      | "deleteColumn"
      | "skipRight"
      | "skipLeft"
      | "skipUp"
      | "skipDown"
      | "skipSelectRight"
      | "skipSelectLeft"
      | "skipSelectUp"
      | "skipSelectDown"
      | "copy"
      | "cut"
      | "paste"
    >]: { assert: () => void };
  } = {
    undo: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Control>}z{/Control}"));
        expect(undoMock).toHaveBeenCalled();
        undoMock.mockReset();
      },
    },
    redo: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Control>}{Shift>}z{/Shift}{/Control}"));
        expect(redoMock).toHaveBeenCalled();
        redoMock.mockReset();
      },
    },
    selectRow: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Shift>}{Space}{/Shift}"));
        expect(props.onRowSelection).toHaveBeenCalled();
        props.onRowSelection.mockReset();
      },
    },
    selectColumn: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Control>}{Space}{/Control}"));
        expect(props.onColSelection).toHaveBeenCalled();
        props.onColSelection.mockReset();
      },
    },
    clearCellsBackspace: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Backspace}"));
        expect(props.onClearCells).toHaveBeenCalled();
        props.onClearCells.mockReset();
      },
    },
    clearCellsDelete: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Delete}"));
        expect(props.onClearCells).toHaveBeenCalled();
        props.onClearCells.mockReset();
      },
    },
    scrollSheetDown: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}"));
        expect(props.onToggleSheet).toHaveBeenCalledWith(1);
        props.onToggleSheet.mockReset();
      },
    },
    scrollSheetUp: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}"));
        expect(props.onToggleSheet).toHaveBeenCalledWith(-1);
        props.onToggleSheet.mockReset();
      },
    },
    formatAsFloat: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Control>}{Shift>}1{/Shift}{/Control}"));
        expect(props.onSelectionAttributeChange).toHaveBeenCalledWith(
          CellAttribute.NumberFormat,
          NumberFormat.Float
        );
        props.onSelectionAttributeChange.mockReset();
      },
    },
    formatAsTime: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Control>}{Shift>}2{/Shift}{/Control}"));
        expect(props.onSelectionAttributeChange).toHaveBeenCalledWith(
          CellAttribute.NumberFormat,
          `${NumberFormat.Date}-${DEFAULT_TIME_FORMAT}`
        );
        props.onSelectionAttributeChange.mockReset();
      },
    },
    formatAsDate: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Control>}{Shift>}3{/Shift}{/Control}"));
        expect(props.onSelectionAttributeChange).toHaveBeenCalledWith(
          CellAttribute.NumberFormat,
          `${NumberFormat.Date}-${DEFAULT_DATE_FORMAT}`
        );
        props.onSelectionAttributeChange.mockReset();
      },
    },
    formatAsCurrency: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Control>}{Shift>}4{/Shift}{/Control}"));
        expect(props.onSelectionAttributeChange).toHaveBeenCalledWith(
          CellAttribute.NumberFormat,
          NumberFormat.Money
        );
        props.onSelectionAttributeChange.mockReset();
      },
    },
    formatAsPercentage: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Control>}{Shift>}5{/Shift}{/Control}"));
        expect(props.onSelectionAttributeChange).toHaveBeenCalledWith(
          CellAttribute.NumberFormat,
          NumberFormat.Percentage
        );
        props.onSelectionAttributeChange.mockReset();
      },
    },
    bold: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Control>}B{/Control}"));
        expect(props.onSelectionAttributeChange).toHaveBeenCalledWith(
          CellAttribute.TextStyle,
          TextStyle.Bold
        );
        props.onSelectionAttributeChange.mockReset();
      },
    },
    startSearch: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Control>}F{/Control}"));
        expect(props.onSearchStart).toHaveBeenCalled();
        props.onSearchStart.mockReset();
      },
    },
    escape: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Escape}"));
        expect(props.onEscape).toHaveBeenCalled();
        props.onEscape.mockReset();
      },
    },
    italic: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Control>}I{/Control}"));
        expect(props.onSelectionAttributeChange).toHaveBeenCalledWith(
          CellAttribute.TextStyle,
          TextStyle.Italic
        );
        props.onSelectionAttributeChange.mockReset();
      },
    },
    underline: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Control>}U{/Control}"));
        expect(props.onSelectionAttributeChange).toHaveBeenCalledWith(
          CellAttribute.TextStyle,
          TextStyle.Underline
        );
        props.onSelectionAttributeChange.mockReset();
      },
    },
    clearCells: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Control>}{Backslash}{/Control}"));
        expect(props.onClearCells).toHaveBeenCalled();
        props.onClearCells.mockReset();
      },
    },
    alignTextCenter: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Control>}{Shift>}E{/Shift}{/Control}"));
        expect(props.onSelectionAttributeChange).toHaveBeenCalledWith(
          CellAttribute.TextAlign,
          TextAlign.Center
        );
        props.onSelectionAttributeChange.mockReset();
      },
    },
    alignTextLeft: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Control>}{Shift>}L{/Shift}{/Control}"));
        expect(props.onSelectionAttributeChange).toHaveBeenCalledWith(
          CellAttribute.TextAlign,
          TextAlign.Left
        );
        props.onSelectionAttributeChange.mockReset();
      },
    },
    alignTextRight: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Control>}{Shift>}R{/Shift}{/Control}"));
        expect(props.onSelectionAttributeChange).toHaveBeenCalledWith(
          CellAttribute.TextAlign,
          TextAlign.Right
        );
        props.onSelectionAttributeChange.mockReset();
      },
    },
    toggleBorderTop: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Alt>}{Shift>}1{/Shift}{/Alt}"));
        expect(props.onUpdateCellBorders).toHaveBeenCalledWith(
          CellAttribute.Border,
          BorderAttribute.Top
        );
        props.onUpdateCellBorders.mockReset();
      },
    },
    toggleBorderRight: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Alt>}{Shift>}2{/Shift}{/Alt}"));
        expect(props.onUpdateCellBorders).toHaveBeenCalledWith(
          CellAttribute.Border,
          BorderAttribute.Right
        );
        props.onUpdateCellBorders.mockReset();
      },
    },
    toggleBorderBottom: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Alt>}{Shift>}3{/Shift}{/Alt}"));
        expect(props.onUpdateCellBorders).toHaveBeenCalledWith(
          CellAttribute.Border,
          BorderAttribute.Bottom
        );
        props.onUpdateCellBorders.mockReset();
      },
    },
    toggleBorderLeft: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Alt>}{Shift>}4{/Shift}{/Alt}"));
        expect(props.onUpdateCellBorders).toHaveBeenCalledWith(
          CellAttribute.Border,
          BorderAttribute.Left
        );
        props.onUpdateCellBorders.mockReset();
      },
    },
    clearBorder: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Alt>}{Shift>}6{/Shift}{/Alt}"));
        expect(props.onUpdateCellBorders).toHaveBeenCalledWith(
          CellAttribute.Border,
          BorderAttribute.Clear
        );
        props.onUpdateCellBorders.mockReset();
      },
    },
    toggleOuterBorder: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Alt>}{Shift>}7{/Shift}{/Alt}"));
        expect(props.onUpdateCellBorders).toHaveBeenCalledWith(
          CellAttribute.Border,
          BorderAttribute.Outer
        );
        props.onUpdateCellBorders.mockReset();
      },
    },
    toggleOuterBorderCtrl: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Control>}{Shift>}7{/Shift}{/Control}"));
        expect(props.onUpdateCellBorders).toHaveBeenCalledWith(
          CellAttribute.Border,
          BorderAttribute.Outer
        );
        props.onUpdateCellBorders.mockReset();
      },
    },
    openHyperlink: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Alt>}{Enter}{/Alt}"));
        expect(props.onOpenHyperlink).toHaveBeenCalled();
        props.onOpenHyperlink.mockReset();
      },
    },
    hideRowHeader: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Control>}{Alt>}9{/Alt}{/Control}"));
        expect(props.onHandleHeaderResize).toHaveBeenCalledWith(Dimension.Row);
        props.onHandleHeaderResize.mockReset();
      },
    },
    hideColumnHeader: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Control>}{Alt>}0{/Alt}{/Control}"));
        expect(props.onHandleHeaderResize).toHaveBeenCalledWith(Dimension.Col);
        props.onHandleHeaderResize.mockReset();
      },
    },
    showRowHeader: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Control>}{Shift>}9{/Shift}{/Control}"));
        expect(props.onHandleHeaderUnhide).toHaveBeenCalledWith(Dimension.Row);
        props.onHandleHeaderUnhide.mockReset();
      },
    },
    showColumnHeader: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Control>}{Shift>}0{/Shift}{/Control}"));
        expect(props.onHandleHeaderUnhide).toHaveBeenCalledWith(Dimension.Col);
        props.onHandleHeaderUnhide.mockReset();
      },
    },
    addLink: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Control>}k{/Control}"));
        expect(modalDispatch).toHaveBeenCalledWith({
          action: ModalReducerAction.Show,
          props: {
            element: LinkDialog,
          },
        });
        modalDispatch.mockReset();
      },
    },
    selectAll: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Control>}a{/Control}"));
        expect(props.onSelectAll).toHaveBeenCalled();
        props.onSelectAll.mockReset();
      },
    },
    editNote: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Shift>}{F2}{/Shift}"));
        expect(modalDispatch).toHaveBeenCalledWith({
          action: ModalReducerAction.Show,
          props: {
            element: NoteDialog,
          },
        });
        modalDispatch.mockReset();
      },
    },
    mergeCells: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Control>}m{/Control}"));
        expect(props.onToggleMergeCells).toHaveBeenCalled();
        props.onToggleMergeCells.mockReset();
      },
    },
    platformInsertRowBefore: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Alt>}{Shift>}i{/Shift}{/Alt}r"));
        expect(insertDeleteCellsMock).toHaveBeenCalledWith({
          sheetTransform: SheetTransform.InsertBefore,
          dimension: Dimension.Row,
          selectedIndex: 0,
        });
        insertDeleteCellsMock.mockReset();
      },
    },
    platformInsertColumnBefore: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Alt>}{Shift>}i{/Shift}{/Alt}c"));
        expect(insertDeleteCellsMock).toHaveBeenCalledWith({
          sheetTransform: SheetTransform.InsertBefore,
          dimension: Dimension.Col,
          selectedIndex: 0,
        });
        insertDeleteCellsMock.mockReset();
      },
    },
    platformInsertRowAfter: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Alt>}{Shift>}i{/Shift}{/Alt}b"));
        expect(insertDeleteCellsMock).toHaveBeenCalledWith({
          sheetTransform: SheetTransform.InsertBefore,
          dimension: Dimension.Row,
          selectedIndex: 1,
        });
        insertDeleteCellsMock.mockReset();
      },
    },
    platformInsertColumnAfter: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Alt>}{Shift>}i{/Shift}{/Alt}w"));
        expect(insertDeleteCellsMock).toHaveBeenCalledWith({
          sheetTransform: SheetTransform.InsertBefore,
          dimension: Dimension.Col,
          selectedIndex: 1,
        });
        insertDeleteCellsMock.mockReset();
      },
    },
    platformDeleteRow: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Alt>}{Shift>}e{/Shift}{/Alt}d"));
        expect(insertDeleteCellsMock).toHaveBeenCalledWith({
          sheetTransform: SheetTransform.Delete,
          dimension: Dimension.Row,
          selectedIndex: 0,
        });
        insertDeleteCellsMock.mockReset();
      },
    },
    platformDeleteColumn: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Alt>}{Shift>}e{/Shift}{/Alt}e"));
        expect(insertDeleteCellsMock).toHaveBeenCalledWith({
          sheetTransform: SheetTransform.Delete,
          dimension: Dimension.Col,
          selectedIndex: 0,
        });
        insertDeleteCellsMock.mockReset();
      },
    },
    decreaseFontSize: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Alt>}h{/Alt}fk"));
        expect(props.onDecreaseFontSize).toHaveBeenCalled();
        props.onDecreaseFontSize.mockReset();
      },
    },
    increaseFontSize: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Alt>}h{/Alt}fg"));
        expect(props.onIncreaseFontSize).toHaveBeenCalled();
        props.onIncreaseFontSize.mockReset();
      },
    },
    openShortcutModal: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Alt>}h{/Alt}"));
        await new Promise((r) => setTimeout(r, 500));
        expect(modalDispatch).toHaveBeenCalledWith({
          action: ModalReducerAction.Show,
          props: {
            element: ShortcutModal,
            elementProps: expect.anything(),
          },
        });
        modalDispatch.mockReset();
      },
    },
    download: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Control>}{Shift>}D{/Shift}{/Control}"));
        expect(props.onDownload).toHaveBeenCalled();
        props.onDownload.mockReset();
      },
    },
    createNewSheet: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Shift>}{F11}{/Shift}"));
        expect(props.onNewSheet).toHaveBeenCalled();
        props.onNewSheet.mockReset();
      },
    },
    createNewTyne: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Control>}N{/Control}"));
        expect(props.onTyneAction).toHaveBeenCalledWith(TyneAction.New);
        props.onTyneAction.mockReset();
      },
    },
    openTyne: {
      assert: async () => {
        await act(() => userEvent.keyboard("{Control>}O{/Control}"));
        expect(modalDispatch).toHaveBeenCalledWith({
          action: ModalReducerAction.Show,
          props: {
            element: OpenTyneDialogDataWrapper,
          },
        });
        modalDispatch.mockReset();
      },
    },
  };

  return {
    props,
    checks,
    modalDispatch,
  };
};

test("NeptyneContainerHotKeys", async () => {
  const { props, checks, modalDispatch } = getShortcutConfig();

  const { container } = render(
    <ModalContext.Provider value={modalDispatch}>
      <NeptyneContainerHotKeys
        isModalOpen={false}
        sheetSelection={{ start: { row: 0, col: 0 }, end: { row: 0, col: 0 } }}
        {...props}
      />
    </ModalContext.Provider>
  );

  // TODO: figure out how to selectively test global shortcuts and sheet-only shortcuts. We totally
  // can do this, we just need to figure out a configuration.
  //
  // but now userEvent.keyboard says the entire document is event.target, which breaks tests for
  // sheet-only shortcuts
  container.parentElement!.id = "inner-sheet_container";

  for (const i in checks) {
    const { assert } = checks[i as keyof typeof checks];
    await assert();
  }
});
