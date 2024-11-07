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

export const MergedCellValidationModal = ({ open, onClose }: Props) => {
  const dialogLabel = "merged-cells-validation-form-dialog-title";

  return (
    <NeptyneDialog
      open={open}
      onClose={onClose}
      onConfirm={onClose}
      ariaLabel={dialogLabel}
      data-testid={dialogLabel}
    >
      <DialogTitle id={dialogLabel}>There was a problem</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Sorry, there cannot be merged cells with frozen rows/colums in the middle of
          them. Please unfreeze rows/cols or unmerge cells.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button autoFocus onClick={onClose} color="primary">
          OK
        </Button>
      </DialogActions>
    </NeptyneDialog>
  );
};
