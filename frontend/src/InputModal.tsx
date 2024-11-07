import {
  Button,
  DialogActions,
  DialogContent,
  DialogContentText,
  IconButton,
  InputAdornment,
  TextField,
} from "@mui/material";
import { useState } from "react";

import { NeptyneDialog } from "./NeptyneDialog";
import { Visibility, VisibilityOff } from "@mui/icons-material";

interface Props {
  prompt: string | null;
  password: boolean;
  onClose: (value: string) => void;
  secretRequestKey: string | null;
}

export const InputModal = ({ prompt, password, onClose, secretRequestKey }: Props) => {
  const [value, setValue] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const dialogLabel = "form-dialog-title";

  const handleClose = () => {
    onClose(value);
    setValue("");
  };

  const flipShowPassword = () => {
    setShowPassword(!showPassword);
  };

  return (
    <NeptyneDialog
      open={prompt !== null}
      onClose={handleClose}
      onConfirm={handleClose}
      ariaLabel={dialogLabel}
    >
      <DialogContent>
        {prompt?.split("\n").map((line, index) => (
          <DialogContentText key={index} color={"black"}>
            {line}
          </DialogContentText>
        ))}
        <TextField
          fullWidth
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              handleClose();
            }
          }}
          onChange={(event) => setValue(event.target.value)}
          type={password && !showPassword ? "password" : undefined}
          value={value}
          data-testid={"input-modal-text-field"}
          InputProps={
            password
              ? {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label="toggle password visibility"
                        onClick={flipShowPassword}
                        onMouseDown={flipShowPassword}
                      >
                        {showPassword && <Visibility />}
                        {!showPassword && <VisibilityOff />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }
              : {}
          }
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="primary">
          Submit
        </Button>
      </DialogActions>
    </NeptyneDialog>
  );
};
