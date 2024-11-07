import React, {
  FunctionComponent,
  useCallback,
  useState,
  useRef,
  useMemo,
  memo,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import { v4 as uuid } from "uuid";

import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import { DndContext } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { SortableContext, useSortable } from "@dnd-kit/sortable";

import { ReactComponent as Add } from "../../icons/add.svg";

import {
  Button,
  ButtonGroup,
  Divider,
  Icon,
  IconButton,
  MenuItem,
  Stack,
  Theme,
  Tooltip,
} from "@mui/material";
import { ConfirmDialog } from "../../ConfirmDialog";
import { NeptyneMenuDropdown } from "../../components/NeptyneDropdown";
import { SystemStyleObject } from "@mui/system";
import { NavigateSheet } from "./NavigateSheet";
import { SheetNameEditor } from "./SheetNameEditor";
import {
  ARROW_DROPDOWN_SX,
  DIVIDER_STYLES,
  MENU_BACKGROUND_SX,
  LARGE_DIVIDER_SX,
  SHEETS_MENU_STYLES,
  ADD_SHEET_BUTTON_SX,
} from "./sheet-menu-styles";
import { sheetIdToVirtualKey, useSheetsDndOrdering } from "./use-sheets-dnd-ordering";

export interface SheetItem {
  name: string;
  id: number;
}

export interface SheetsMenuProps {
  sheets: SheetItem[];
  sheetsOrder: number[];
  onSheetsReorder: (newSheetsOrder: number[]) => void;
  activeSheetId?: number;
  onSheetClick: (id: number) => void;
  onAddSheet: () => void;
  onDeleteSheet: (id: number) => void;
  onRenameSheet: (id: number, newName: string) => void;
}

interface SheetsMenuItemProps {
  sheetItem: SheetItem;
  isActive: boolean;
  isLast: boolean;
  canDeleteSheet: boolean;
  isEditing: boolean;
  onIsEditingChange: (isEditing: boolean) => void;
  onClick: (id: number) => void;
  onDeleteSheet: (id: number) => void;
  onRenameSheet: (id: number, newName: string) => void;
  hasErrors: (id: number, value: string) => string | undefined;
}

const SortableSheetsMenuItem: FunctionComponent<SheetsMenuItemProps> = (props) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: sheetIdToVirtualKey(props.sheetItem),
  });

  const style = useMemo(
    () => ({
      transform: CSS.Translate.toString(transform),
      transition,
      listStyleType: "none",
      display: "inherit",
      alignItems: "center",
    }),
    [transform, transition]
  );

  return (
    <li
      data-testid={`sortable-sheet-${props.sheetItem.name}`}
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={style}
    >
      <SheetsMenuItem {...props} />
    </li>
  );
};

export const SheetsMenuItem: FunctionComponent<SheetsMenuItemProps> = memo(
  ({
    sheetItem,
    isActive,
    isLast,
    canDeleteSheet,
    isEditing,
    onIsEditingChange,
    onRenameSheet,
    onDeleteSheet,
    onClick,
    hasErrors,
  }) => {
    const [isHovered, setIsHovered] = useState(false);
    const [open, setOpen] = useState(false);
    const anchorRef = useRef<HTMLDivElement>(null);
    const [sheetMenuName, setSheetMenuName] = useState(sheetItem.name);

    const handleToggle = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      setOpen((prevOpen) => !prevOpen);
    }, []);

    const handleClose = useCallback((event: Event) => {
      if (
        anchorRef.current &&
        anchorRef.current.contains(event.target as HTMLElement)
      ) {
        return;
      }

      setOpen(false);
    }, []);

    const handleHasErrors = useCallback(
      (newSheetName: string) => hasErrors(sheetItem.id, newSheetName),
      [hasErrors, sheetItem.id]
    );

    const handleSubmit = useCallback(
      (newSheetName: string) => {
        onIsEditingChange(false);
        setSheetMenuName(newSheetName);
        onRenameSheet(sheetItem.id, newSheetName);
      },
      [onIsEditingChange, onRenameSheet, sheetItem.id]
    );

    const handleRevert = useCallback(
      () => onIsEditingChange(false),
      [onIsEditingChange]
    );

    const handleButtonClick = useCallback(
      () => onClick(sheetItem.id),
      [onClick, sheetItem.id]
    );
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

    const handleDeleteConfirmClose = useCallback(
      (confirm: boolean) => {
        if (confirm) {
          onDeleteSheet(sheetItem.id);
        }
        setDeleteDialogOpen(false);
      },
      [onDeleteSheet, sheetItem.id]
    );

    const handleRename = useCallback(
      (e: React.MouseEvent) => {
        handleClose(e.nativeEvent);
        onIsEditingChange(true);
      },
      [handleClose, onIsEditingChange]
    );

    const handleDelete = useCallback(
      (e: any) => {
        handleClose(e.nativeEvent);
        setDeleteDialogOpen(true);
      },
      [handleClose]
    );

    const buttonGroupSx = useMemo(() => {
      if (isEditing) {
        return (neptyneTheme: Theme) => ({
          height: "24px",
          outline: `1px solid ${neptyneTheme.palette.secondary.main}`,
          "& .MuiButton-root": {
            backgroundColor: "secondary.lightBackground",
          },
        });
      }

      const sx = {
        height: "24px",
        "& .MuiButton-root": {
          backgroundColor: isActive ? "secondary" : "transparent",
          "&:hover": {
            backgroundColor: isActive ? "secondary" : "secondary.lightBackground",
          },
        },
      };
      return isActive ? sx : { ...sx, color: "text.primary" };
    }, [isActive, isEditing]);

    const buttonSx: SystemStyleObject = useMemo(() => {
      const commonStyles: SystemStyleObject = {
        verticalAlign: "center",
        textTransform: "none",
      };
      return !isHovered || (isHovered && isEditing)
        ? {
            paddingLeft: "22px",
            paddingRight: "22px",
            ...commonStyles,
          }
        : { ...commonStyles };
    }, [isHovered, isEditing]);

    return (
      <>
        <ButtonGroup
          ref={anchorRef}
          data-testid={`sheet-${sheetMenuName}`}
          disableFocusRipple
          variant="contained"
          aria-label="menu item"
          color={isActive ? "secondary" : "inherit"}
          size="small"
          sx={buttonGroupSx}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onDoubleClick={handleRename}
          disableRipple
        >
          <Button
            disableRipple
            data-testid={`sheet-${sheetMenuName}-button`}
            endIcon={
              isHovered &&
              !isEditing && (
                <ArrowDropDownIcon
                  aria-label="menu item dropdown"
                  sx={ARROW_DROPDOWN_SX}
                  onClick={handleToggle}
                />
              )
            }
            sx={buttonSx}
            onClick={handleButtonClick}
          >
            {isEditing ? (
              <SheetNameEditor
                value={sheetMenuName}
                hasErrors={handleHasErrors}
                onSubmit={handleSubmit}
                onRevert={handleRevert}
              />
            ) : (
              sheetMenuName
            )}
          </Button>
        </ButtonGroup>
        <SheetMenuDropdown
          isOpen={open}
          anchor={anchorRef.current}
          canDeleteSheet={canDeleteSheet}
          onClose={handleClose}
          onDelete={handleDelete}
          onRenameStart={handleRename}
        />
        <DeleteTyneConfirm open={deleteDialogOpen} onClose={handleDeleteConfirmClose} />
        {!isLast && <Divider orientation="vertical" style={DIVIDER_STYLES} />}
      </>
    );
  }
);

const useSheetsMenuNavigation = () => {
  const listRef = useRef<HTMLDivElement>(null);

  const handleNavigateLeft = useCallback(
    () => listRef.current?.scrollBy({ left: -120, behavior: "smooth" }),
    []
  );
  const handleNavigateRight = useCallback(
    () => listRef.current?.scrollBy({ left: 120, behavior: "smooth" }),
    []
  );

  return {
    listRef,
    onNavigateLeft: handleNavigateLeft,
    onNavigateRight: handleNavigateRight,
  };
};

const hasErrors = (newValueId: number, newValue: string, sheets: SheetItem[]) => {
  const hasConflictingNames = sheets
    .filter(({ id }) => id !== newValueId)
    .some(({ name }) => newValue === name);
  if (hasConflictingNames) {
    return "Please pick a unique name";
  }
  if (!newValue.length) {
    return "Please enter sheet name";
  }
};

export interface SheetsMenuApi {
  renameSheet: () => void;
}

export const SheetsMenu = forwardRef<SheetsMenuApi, SheetsMenuProps>(
  (
    {
      sheets,
      activeSheetId,
      onSheetsReorder,
      onAddSheet,
      onDeleteSheet,
      onRenameSheet,
      onSheetClick,
      sheetsOrder,
    },
    ref
  ) => {
    const handleHasErrors = useCallback(
      (newValueId: number, newValue: string) => hasErrors(newValueId, newValue, sheets),
      [sheets]
    );

    const [editingSheetId, setEditingSheetId] = useState<number>();

    const { listRef, ...navigatorProps } = useSheetsMenuNavigation();

    const { dndContextProps, sortableContextProps, orderedSheets } =
      useSheetsDndOrdering(sheetsOrder, sheets, onSheetsReorder);

    useImperativeHandle<SheetsMenuApi, SheetsMenuApi>(ref, () => ({
      renameSheet: () => setEditingSheetId(activeSheetId),
    }));

    return (
      <Stack direction="row" alignItems="center" sx={MENU_BACKGROUND_SX}>
        <NavigateSheet {...navigatorProps} />
        <Divider orientation="vertical" style={LARGE_DIVIDER_SX} />
        <div
          data-testid="sheets-menu"
          className="hide-scrollbar"
          style={SHEETS_MENU_STYLES}
          ref={listRef}
        >
          <DndContext {...dndContextProps}>
            <SortableContext {...sortableContextProps}>
              {orderedSheets.map((sheetItem, index) => (
                <SortableSheetsMenuItem
                  key={sheetItem.id}
                  isLast={index === orderedSheets.length - 1}
                  isActive={sheetItem.id === activeSheetId}
                  canDeleteSheet={sheetItem.id !== 0}
                  sheetItem={sheetItem}
                  isEditing={editingSheetId === sheetItem.id}
                  onIsEditingChange={(isEditing) =>
                    setEditingSheetId(
                      isEditing && editingSheetId !== sheetItem.id
                        ? sheetItem.id
                        : undefined
                    )
                  }
                  hasErrors={handleHasErrors}
                  onDeleteSheet={onDeleteSheet}
                  onRenameSheet={onRenameSheet}
                  onClick={onSheetClick}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
        <Divider orientation="vertical" style={DIVIDER_STYLES} />
        <AddSheet onAddSheet={onAddSheet} />
      </Stack>
    );
  }
);

interface DeleteTyneConfirmProps {
  open: boolean;
  onClose: (confirm: boolean) => void;
}

const DeleteTyneConfirm: FunctionComponent<DeleteTyneConfirmProps> = (props) => (
  <ConfirmDialog
    title="Delete Sheet"
    prompt="Are you sure you want to delete this sheet? This action cannot be undone"
    {...props}
  />
);

interface SheetMenuDropdownProps {
  isOpen: boolean;
  anchor: HTMLDivElement | null;
  onClose: (event: Event) => void;
  canDeleteSheet: boolean;
  onRenameStart: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}

const SheetMenuDropdown: FunctionComponent<SheetMenuDropdownProps> = ({
  canDeleteSheet,
  onRenameStart,
  onDelete,
  ...dropdownProps
}) => {
  return (
    <NeptyneMenuDropdown {...dropdownProps}>
      <MenuItem key="rename" onClick={onRenameStart}>
        Rename
      </MenuItem>
      <MenuItem key="Delete" disabled={!canDeleteSheet} onClick={onDelete}>
        Delete
      </MenuItem>
    </NeptyneMenuDropdown>
  );
};

const AddSheet: FunctionComponent<{ onAddSheet: () => void }> = ({ onAddSheet }) => (
  <Tooltip title="Add sheet" placement="top">
    <IconButton
      data-testid="add-sheet"
      aria-label="add sheet"
      onClick={onAddSheet}
      sx={ADD_SHEET_BUTTON_SX}
    >
      <Icon component={Add} />
    </IconButton>
  </Tooltip>
);

export const HardReloadSheetMenu = memo(
  forwardRef<SheetsMenuApi, SheetsMenuProps>((props, ref) => {
    const [key, setKey] = useState(uuid);
    useEffect(() => setKey(uuid()), [props.sheets]);
    return <SheetsMenu key={key} {...props} ref={ref} />;
  })
);
