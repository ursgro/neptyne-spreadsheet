import React, { useMemo } from "react";
import Menu from "@mui/material/Menu";
import SvgIcon from "@mui/material/SvgIcon/SvgIcon";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import { Icon as FeatherIcon, Table } from "react-feather";
import Divider from "@mui/material/Divider";
import GridOnIcon from "@mui/icons-material/GridOn";

import { colIxToA1, SheetSelection } from "../SheetUtils";
import { Dimension } from "../NeptyneProtocol";
import { makeHotKeyHumanReadable } from "../hotkeyUtils";
import { Box } from "@mui/material";
import { getHeaderContextMenuActions } from "../ContextMenuUtils";

export interface ContextMenuPosition {
  x: number;
  y: number;
}

export interface ContextMenuAction {
  type: string;
  icon: typeof SvgIcon | FeatherIcon;
  title: string;
  disabled?: boolean;
  shortcut?: string;
}

interface ContextMenuProps {
  canDeleteDimension: boolean;
  isColumnSelected: boolean;
  isRowSelected: boolean;
  frozenRows: number;
  frozenCols: number;
  contextMenuPosition: ContextMenuPosition | null;
  cellContextMenuActions: ContextMenuAction[];
  sheetSelection: SheetSelection;
  onClick: (action: string) => void;
  onClose: () => void;
}

export const ContextMenu: React.FunctionComponent<ContextMenuProps> = ({
  canDeleteDimension,
  isColumnSelected,
  isRowSelected,
  frozenRows,
  frozenCols,
  contextMenuPosition,
  cellContextMenuActions,
  sheetSelection,
  onClick,
  onClose,
}) => {
  const contextMenuActions = useMemo(() => {
    if (isRowSelected || isColumnSelected) {
      const dimension = isRowSelected ? Dimension.Row : Dimension.Col;
      const headerIndex = isRowSelected
        ? sheetSelection.start.row
        : sheetSelection.start.col;
      const defaultActions = getHeaderContextMenuActions(
        dimension,
        sheetSelection,
        canDeleteDimension
      );
      let actions = [...defaultActions];
      const frozenCount = isRowSelected ? frozenRows : frozenCols;

      if (frozenCount !== headerIndex + 1) {
        const {
          start: { row: startRow, col: startCol },
        } = sheetSelection;
        actions.push({
          type: "freeze",
          icon: Table,
          title: isRowSelected
            ? `Freeze up to row ${startRow + 1}`
            : `Freeze up to column ${colIxToA1(startCol)}`,
        });
      }
      if (frozenCount > 0) {
        actions.push({
          type: "unfreeze",
          icon: GridOnIcon,
          title: isRowSelected ? "Unfreeze rows" : "Unfreeze columns",
        });
      }

      return actions;
    }

    return cellContextMenuActions;
  }, [
    canDeleteDimension,
    isColumnSelected,
    isRowSelected,
    cellContextMenuActions,
    frozenRows,
    frozenCols,
    sheetSelection,
  ]);

  if (contextMenuPosition === null) {
    return null;
  }

  return (
    <Menu
      open={true}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={{ top: contextMenuPosition.y, left: contextMenuPosition.x }}
      PaperProps={{
        style: {
          width: 240,
          border: "1px solid #ccc",
        },
      }}
      slotProps={{
        backdrop: {
          onMouseDown: (e) => e.button === 2 && onClose(),
        },
      }}
    >
      {contextMenuActions.map((action, index) => {
        if (action.type === "divider") {
          return <Divider key={`context_menu_divider_${index}`} />;
        }
        return (
          <ContextMenuItem
            key={action.type}
            {...action}
            onClick={() => {
              onClick(action.type);
              onClose();
            }}
          />
        );
      })}
    </Menu>
  );
};

interface ContextMenuItemProps extends ContextMenuAction {
  onClick: () => void;
}

const CONTEXT_MENU_ICON_SX = {
  width: "18px",
  height: "18px",
};

export const ContextMenuItem: React.FunctionComponent<ContextMenuItemProps> = (
  props
) => {
  const { icon, type, title, disabled, shortcut, onClick } = props;

  return (
    <MenuItem
      key={type}
      disabled={disabled}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
    >
      <ListItemIcon>
        <Box component={icon} sx={CONTEXT_MENU_ICON_SX} />
      </ListItemIcon>
      <ListItemText>{title}</ListItemText>
      {shortcut && (
        <Typography variant="body2" color="text.secondary">
          {makeHotKeyHumanReadable(shortcut)}
        </Typography>
      )}
    </MenuItem>
  );
};
