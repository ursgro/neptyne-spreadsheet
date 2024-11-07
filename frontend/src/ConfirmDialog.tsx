import React, { useCallback } from "react";
import Button from "@mui/material/Button";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import { NeptyneDialog } from "./NeptyneDialog";

interface ConfirmDialogProps {
  open: boolean;
  onClose: (value: boolean) => void;
  title: string;
  prompt: string;
}

export const ConfirmDialog = ({ open, onClose, title, prompt }: ConfirmDialogProps) => {
  const dialogLabel = "form-dialog-title";
  const handleClose = useCallback(() => onClose(false), [onClose]);
  const handleConfirm = useCallback(() => onClose(true), [onClose]);

  return (
    <NeptyneDialog
      open={open}
      onClose={handleClose}
      onConfirm={handleConfirm}
      ariaLabel={dialogLabel}
    >
      <DialogTitle id={dialogLabel}>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{prompt}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="primary">
          Cancel
        </Button>
        <Button autoFocus onClick={handleConfirm} color="primary">
          OK
        </Button>
      </DialogActions>
    </NeptyneDialog>
  );
};
