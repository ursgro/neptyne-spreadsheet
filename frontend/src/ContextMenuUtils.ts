import { CellContextMenuAction } from "./neptyne-sheet/NeptyneCell";
import HorizontalRuleIcon from "@mui/icons-material/HorizontalRule";
import ContentCut from "@mui/icons-material/ContentCut";
import { hotKeys } from "./hotkeyConstants";
import ContentCopy from "@mui/icons-material/ContentCopy";
import ContentPaste from "@mui/icons-material/ContentPaste";
import { SheetSelection } from "./SheetUtils";
import { StickyNote2Outlined } from "@mui/icons-material";
import { CellAttribute, Dimension } from "./NeptyneProtocol";
import { ReactComponent as WidgetIcon } from "./icons/widget.svg";
import Lock from "@mui/icons-material/Lock";
import LockOpen from "@mui/icons-material/LockOpen";
import Merge from "@mui/icons-material/Merge";
import CallSplitIcon from "@mui/icons-material/CallSplit";
import memoizeOne from "memoize-one";
import isEqual from "react-fast-compare";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import FitScreen from "@mui/icons-material/FitScreen";
import PlaylistAddIcon from "@mui/icons-material/PlaylistAdd";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import {
  CellAttributes,
  colIxToA1,
  isSelectionEqual,
  selectionToRect,
} from "./SheetUtils";

const ContextMenuDivider: CellContextMenuAction = {
  type: "divider",
  icon: HorizontalRuleIcon,
  title: "",
};

const defaultCellContextMenuActions: CellContextMenuAction[] = [
  {
    type: "cut",
    icon: ContentCut,
    title: "Cut",
    shortcut: hotKeys.cut,
  },
  {
    type: "copy",
    icon: ContentCopy,
    title: "Copy",
    shortcut: hotKeys.copy,
  },
  {
    type: "paste",
    icon: ContentPaste,
    title: "Paste",
    shortcut: hotKeys.paste,
  },
];

const protectCellContextMenuAction: CellContextMenuAction = {
  type: "protect",
  icon: Lock,
  title: "Protect",
};

const unprotectCellContextMenuAction: CellContextMenuAction = {
  type: "unprotect",
  icon: LockOpen,
  title: "Unprotect",
};

const mergeCellAction: CellContextMenuAction = {
  type: "merge",
  icon: Merge,
  title: "Merge",
};

const unmergeCellAction: CellContextMenuAction = {
  type: "unmerge",
  icon: CallSplitIcon,
  title: "Unmerge",
};

const withoutDuplicatedElements = <T extends any, A extends (any | null | T)[]>(
  array: A,
  element: T
): A =>
  array
    .filter(Boolean)
    .filter(
      (item, index, array) =>
        item !== element ||
        (index !== 0 && index !== array.length - 1 && array[index - 1] !== element)
    ) as A;

const getInsertDeleteCellContextMenuActions = (sheetSelection: SheetSelection) => {
  const { left, right, top, bottom } = selectionToRect(sheetSelection);
  const rowsNum = bottom - top + 1;
  const colsNum = right - left + 1;
  return [
    {
      type: "insert_rows",
      icon: AddIcon,
      title: `Insert ${rowsNum} row${rowsNum > 1 ? "s" : ""} above`,
    },
    {
      type: "insert_cols",
      icon: AddIcon,
      title: `Insert ${colsNum} column${colsNum > 1 ? "s" : ""} left`,
    },
    {
      type: "insert_rows_and_shift",
      icon: PlaylistAddIcon,
      title: `Insert cell${colsNum > 1 || rowsNum > 1 ? "s" : ""} and shift down`,
    },
    {
      type: "insert_cols_and_shift",
      icon: PlaylistAddIcon,
      title: `Insert cell${colsNum > 1 || rowsNum > 1 ? "s" : ""} and shift right`,
    },
    ContextMenuDivider,
    {
      type: "delete_rows",
      icon: DeleteIcon,
      title: top === bottom ? "Delete row" : `Delete rows ${top + 1}-${bottom + 1}`,
    },
    {
      type: "delete_cols",
      icon: DeleteIcon,
      title:
        left === right
          ? "Delete column"
          : `Delete columns ${colIxToA1(left)}-${colIxToA1(right)}`,
    },
    {
      type: "delete_rows_and_shift",
      icon: DeleteSweepIcon,
      title: `Delete cell${colsNum > 1 || rowsNum > 1 ? "s" : ""} and shift up`,
    },
    {
      type: "delete_cols_and_shift",
      icon: DeleteSweepIcon,
      title: `Delete cell${colsNum > 1 || rowsNum > 1 ? "s" : ""} and shift left`,
    },
  ];
};

export const getHeaderContextMenuActions = (
  dimension: Dimension,
  sheetSelection: SheetSelection,
  canDelete: boolean
): CellContextMenuAction[] => {
  const isRow = dimension === Dimension.Row;
  const { left, right, top, bottom } = selectionToRect(sheetSelection);
  const rowsNum = bottom - top + 1;
  const colsNum = right - left + 1;
  const insertTitle = isRow
    ? `${rowsNum} row${rowsNum > 1 ? "s" : ""}`
    : `${colsNum} column${colsNum > 1 ? "s" : ""}`;
  const before = dimension === Dimension.Row ? "above" : "left";
  const after = dimension === Dimension.Row ? "below" : "right";
  const hideDeleteTitle = isRow
    ? `row${rowsNum > 1 ? `s ${top + 1}-${bottom + 1}` : ""}`
    : `column${colsNum > 1 ? `s ${colIxToA1(left)}-${colIxToA1(right)}` : ""}`;

  return [
    {
      type: "hide",
      icon: VisibilityOffIcon,
      title: `Hide ${hideDeleteTitle}`,
    },
    {
      type: "autosize",
      icon: FitScreen,
      title: `Autosize ${hideDeleteTitle}`,
    },
    ContextMenuDivider,
    {
      type: "insert_above",
      icon: AddIcon,
      title: `Insert ${insertTitle} ${before}`,
    },
    {
      type: "insert_below",
      icon: AddIcon,
      title: `Insert ${insertTitle} ${after}`,
    },
    ContextMenuDivider,
    canDelete && {
      type: "delete",
      icon: DeleteIcon,
      title: `Delete ${hideDeleteTitle}`,
    },
    canDelete && ContextMenuDivider,
  ].filter(Boolean) as CellContextMenuAction[];
};

const getNoteContextMenuAction = (
  sheetSelection: SheetSelection,
  firstCellAttributes: CellAttributes
): CellContextMenuAction | null =>
  sheetSelection.start.row - sheetSelection.end.row === 0 &&
  sheetSelection.start.col - sheetSelection.end.col === 0
    ? {
        type: "insert_note",
        icon: StickyNote2Outlined,
        title: `${firstCellAttributes[CellAttribute.Note] ? "Update" : "Insert"} Note`,
        shortcut: hotKeys.editNote,
      }
    : null;

const getMergeContextMenuAction = (
  { start, end }: SheetSelection,
  hasMergedCells: boolean
): CellContextMenuAction | null =>
  hasMergedCells
    ? unmergeCellAction
    : start.row !== end.row || start.col !== end.col
    ? mergeCellAction
    : null;

const getWidgetContextMenuActions = (hasWidget: boolean): CellContextMenuAction[] =>
  hasWidget
    ? [
        {
          type: "edit_widget",
          icon: WidgetIcon,
          title: "Update Widget",
        },
      ]
    : [];

export const getCellContextMenuActions = memoizeOne(
  (
    hasProtectedCells: boolean,
    hasWidget: boolean,
    hasMergedCells: boolean,
    sheetSelection: SheetSelection,
    firstCellAttributes: CellAttributes
  ): CellContextMenuAction[] => {
    return withoutDuplicatedElements(
      [
        ContextMenuDivider,
        ...defaultCellContextMenuActions,
        ContextMenuDivider,
        ...getInsertDeleteCellContextMenuActions(sheetSelection),
        ContextMenuDivider,
        // Nulls are filtered below
        getNoteContextMenuAction(sheetSelection, firstCellAttributes)!,
        ContextMenuDivider,
        hasProtectedCells
          ? unprotectCellContextMenuAction
          : protectCellContextMenuAction,

        getMergeContextMenuAction(sheetSelection, hasMergedCells)!,

        // Leave widget context menu hidden until it is working.
        ContextMenuDivider,
        ...getWidgetContextMenuActions(hasWidget),
      ],
      ContextMenuDivider
    );
  },
  (
    [
      newHasProtected,
      newHasWidget,
      newHasMergedCells,
      newSelection,
      firstCellAttributes,
    ],
    [
      lastHasProtected,
      lastHasWidget,
      lastHasMergedCells,
      lastSelection,
      prevFirstCellAttributes,
    ]
  ) => {
    return (
      newHasProtected === lastHasProtected &&
      newHasWidget === lastHasWidget &&
      newHasMergedCells === lastHasMergedCells &&
      isSelectionEqual(newSelection, lastSelection) &&
      isEqual(firstCellAttributes, prevFirstCellAttributes)
    );
  }
);
