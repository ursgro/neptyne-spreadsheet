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

export const ProtectedCellModal = ({ open, onClose }: Props) => {
  const dialogLabel = "protected-cell-form-dialog-title";

  return (
    <NeptyneDialog
      open={open}
      onClose={onClose}
      onConfirm={onClose}
      ariaLabel={dialogLabel}
    >
      <DialogTitle id={dialogLabel}>This cell is protected!</DialogTitle>
      <DialogContent>
        <DialogContentText>Please unprotect cell before editing.</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button autoFocus onClick={onClose} color="primary">
          OK
        </Button>
      </DialogActions>
    </NeptyneDialog>
  );
};
