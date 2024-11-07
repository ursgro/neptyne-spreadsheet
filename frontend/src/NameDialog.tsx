import React from "react";
import { TextField } from "@mui/material";
import Modal from "./components/Modal/Modal";

interface NameDialogProps {
  open: boolean;
  prompt: string;
  title: string;
  value: string;
  onClose: (value: string | null) => void;
  stayOnConfirm?: boolean;
  autoFocus?: boolean;
}

export const NameDialog = ({
  open,
  value,
  onClose,
  title,
  prompt,
  stayOnConfirm = false,
  autoFocus = false,
}: NameDialogProps) => {
  const [newValue, setNewValue] = React.useState(value);

  const handleCancel = () => {
    onClose(null);
  };

  const handleAccept = () => {
    onClose(newValue);
  };

  return (
    <Modal
      open={open}
      title={title}
      prompt={prompt}
      onClose={handleCancel}
      onConfirm={handleAccept}
      stayOnConfirm={stayOnConfirm}
    >
      <TextField
        id="rename-text-field"
        value={newValue}
        autoFocus={autoFocus}
        fullWidth
        onChange={(event) => {
          setNewValue(event.target.value);
        }}
      />
    </Modal>
  );
};
