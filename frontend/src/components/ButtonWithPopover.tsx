import {
  FunctionComponent,
  MouseEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ClickAwayListener, Paper, Popper, styled } from "@mui/material";
import { NeptyneIconButton, NeptyneIconButtonProps } from "./NeptyneIconButton";
import { SystemStyleObject } from "@mui/system";
import { NeptyneIconButtonGroup } from "./NeptyneIconButtonGroup";

export interface ButtonWithPopoverProps
  extends Omit<NeptyneIconButtonProps, "onClick"> {
  popoverId: string;
  popoverContent: ReactNode;
  closeOnClick?: boolean;
  onClick?: NeptyneIconButtonProps["onClick"];
  anchorEl?: HTMLButtonElement | null;
  onAnchorElChange?: (value: HTMLButtonElement | null) => void;
}

export const PopoverContainer: FunctionComponent<{ children: ReactNode }> = ({
  children,
}) => <NeptyneIconButtonGroup reduceOuterMargin>{children}</NeptyneIconButtonGroup>;

const TRANSPARENT_BG = { backgroundColor: "transparent" };

const NeptynePopover = styled(Popper)(({ theme }) => ({
  backgroundColor: theme.palette.secondary.lightBackground,
  border: "1px solid",
  borderColor: theme.palette.secondary.lightBorder,
  borderRadius: "5px",
  borderTopLeftRadius: 0,
  color: "common.black",
  padding: "10px",
  zIndex: theme.zIndex.modal,
}));

const ICON_SX = {
  color: "text.primary",
};

const BASE_BUTTON_SX = {
  "&:not(:disabled)": {
    ".NeptyneIconButton__Icon": ICON_SX,
    "&:hover .NeptyneIconButton__Icon, &:active .NeptyneIconButton__Icon": ICON_SX,
  },
};

const ACTIVE_BUTTON_SX: SystemStyleObject = {
  borderBottomColor: "secondary.lightBackground",
  borderBottomRightRadius: 0,
  borderBottomLeftRadius: 0,
  "&::after": {
    backgroundColor: "secondary.lightBackground",
  },
  ".NeptyneIconButton__Icon": ICON_SX,
};

export const ButtonWithPopover: FunctionComponent<ButtonWithPopoverProps> = ({
  popoverContent,
  popoverId,
  children,
  onClick,
  closeOnClick,
  anchorEl: anchorElProps,
  onAnchorElChange: onAnchorElChangeProps,
  ...buttonProps
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

  useEffect(() => {
    anchorElProps !== undefined && setAnchorEl(anchorElProps);
  }, [anchorElProps]);

  const handleAnchorElChange = useCallback(
    (value: HTMLButtonElement | null) =>
      onAnchorElChangeProps ? onAnchorElChangeProps(value) : setAnchorEl(value),
    [onAnchorElChangeProps]
  );

  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      handleAnchorElChange(event.currentTarget);
      onClick && onClick(event);
    },
    [handleAnchorElChange, onClick]
  );

  const handleClose = useCallback(
    () => handleAnchorElChange(null),
    [handleAnchorElChange]
  );

  const isOpen = !!anchorEl;
  const id = isOpen ? popoverId : undefined;

  const muiButtonProps = useMemo(
    () => ({ ...buttonProps.muiButtonProps, "aria-describedby": id }),
    [buttonProps.muiButtonProps, id]
  );

  return (
    <>
      <NeptyneIconButton
        {...buttonProps}
        isActive={isOpen}
        muiButtonProps={muiButtonProps}
        onClick={handleClick}
        SX={BASE_BUTTON_SX}
        activeSX={ACTIVE_BUTTON_SX}
      >
        {children}
      </NeptyneIconButton>
      <NeptynePopover
        id={id}
        open={isOpen}
        anchorEl={anchorEl}
        onClick={closeOnClick ? handleClose : undefined}
        placement="bottom-start"
      >
        <ClickAwayListener onClickAway={handleClose}>
          <Paper sx={TRANSPARENT_BG}>{popoverContent as any}</Paper>
        </ClickAwayListener>
      </NeptynePopover>
    </>
  );
};
