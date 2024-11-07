import { FunctionComponent } from "react";

import CloseIcon from "@mui/icons-material/Close";

import { Alert, IconButton, Snackbar, SnackbarOrigin } from "@mui/material";

const SNACKBAR_ANCHOR_ORIGIN: SnackbarOrigin = {
  vertical: "top",
  horizontal: "center",
};

interface ErrorSnackbarProps {
  isOpen: boolean;
  content: string | JSX.Element | undefined;
  severity: "error" | "info" | "success";
  onClick: () => void;
  onClose?: () => void;
  closeAllowed?: boolean;
  anchorOrigin?: SnackbarOrigin;
}

export const NeptyneSnackbar: FunctionComponent<ErrorSnackbarProps> = ({
  isOpen,
  content,
  severity,
  onClick,
  onClose,
  closeAllowed,
  anchorOrigin,
}) => (
  <Snackbar
    open={isOpen}
    anchorOrigin={anchorOrigin ?? SNACKBAR_ANCHOR_ORIGIN}
    onClose={onClose}
  >
    <Alert className="alert-icon-centered" severity={severity}>
      {content}
      {closeAllowed && (
        <IconButton size="small" onClick={onClick}>
          <CloseIcon />
        </IconButton>
      )}
    </Alert>
  </Snackbar>
);
