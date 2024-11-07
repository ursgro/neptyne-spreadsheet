import React from "react";
import {
  Button,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";
import { NeptyneDialog } from "./NeptyneDialog";

interface Props {
  open: boolean;
  onClose: () => void;
}

export const IdleShutdownModal = ({ open, onClose }: Props) => {
  const dialogLabel = "form-dialog-title";
  const handleClose = () => {
    onClose();
  };

  return (
    <NeptyneDialog
      open={open}
      onClose={handleClose}
      onConfirm={handleClose}
      ariaLabel={dialogLabel}
    >
      <DialogTitle id={dialogLabel}>Session Idle</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Looks like you stepped away, so we've put things on hold for a bit.
          <br />
          Click OK to get working again.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="primary">
          OK
        </Button>
      </DialogActions>
    </NeptyneDialog>
  );
};
