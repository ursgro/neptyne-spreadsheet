import React, { useCallback } from "react";
import { Dialog, SxProps, Theme } from "@mui/material";
import { Breakpoint } from "@mui/system";
import { getGSheetAppConfig } from "./gsheet_app_config";

interface NeptyneDialogProps {
  open: boolean;
  fullScreen?: boolean;
  scroll?: "body" | "paper";
  ariaLabel?: string;
  maxWidth?: Breakpoint;
  fullWidth?: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  children: React.ReactNode;
  preventClose?: boolean;
}

const { inGSMode } = getGSheetAppConfig();
const DIALOG_STYLES: SxProps<Theme> = {
  ".MuiPaper-root": {
    backgroundColor: inGSMode ? "#fff" : "grey.100",
  },
  ...(inGSMode
    ? {
        ".MuiDialogContent-root": {
          padding: "0px",
        },
      }
    : {}),
};

export const NeptyneDialog: React.FunctionComponent<NeptyneDialogProps> = (props) => {
  const {
    ariaLabel,
    onConfirm,
    children,
    preventClose,
    scroll = "paper",
    onClose,
    ...rest
  } = props;

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const keyCode = event.which || event.keyCode;
      const ENTER_KEY = 13;
      if (keyCode === ENTER_KEY && onConfirm) {
        event.preventDefault();
        event.stopPropagation();
        onConfirm();
      }
    },
    [onConfirm]
  );

  return (
    <Dialog
      {...rest}
      scroll={scroll}
      aria-labelledby={ariaLabel}
      onKeyDown={onKeyDown}
      sx={DIALOG_STYLES}
      disableEscapeKeyDown={!!preventClose}
      onClose={preventClose ? undefined : onClose}
    >
      {children}
    </Dialog>
  );
};
