import {
  Button,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";
import * as React from "react";
import { NeptyneDialog } from "../../NeptyneDialog";

interface IModalProps {
  open: boolean;
  stayOnConfirm?: boolean;
  prompt?: string;
  title?: string;
  children: React.ReactElement;
  onConfirm?: () => void;
  onClose?: () => void;
}

const Modal: React.FunctionComponent<IModalProps> = ({
  open,
  stayOnConfirm = false,
  prompt,
  title,
  children,
  onConfirm,
  onClose,
}) => {
  const dialogLabel = "form-dialog-title";
  const handleCancel = () => {
    onClose?.();
  };

  const handleConfirm = () => {
    onConfirm?.();

    if (!stayOnConfirm) {
      onClose?.();
    }
  };

  return (
    <NeptyneDialog
      open={open}
      onClose={handleCancel}
      onConfirm={handleConfirm}
      ariaLabel={dialogLabel}
    >
      <DialogTitle id={dialogLabel}>{title}</DialogTitle>
      <DialogContent>
        {prompt && <DialogContentText>{prompt}</DialogContentText>}
        <div>{children}</div>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel} color="primary">
          Cancel
        </Button>
        <Button onClick={handleConfirm} color="primary">
          OK
        </Button>
      </DialogActions>
    </NeptyneDialog>
  );
};

export default Modal;
