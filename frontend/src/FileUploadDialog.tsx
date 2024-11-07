import React, { useRef } from "react";
import Button from "@mui/material/Button";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import { NeptyneDialog } from "./NeptyneDialog";

interface Props {
  open: boolean;
  prompt: string;
  title: string;
  accept: string;
  onClose: (file: File | null) => void;
}

export const FileUploadDialog = ({ open, onClose, title, prompt, accept }: Props) => {
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);

  const handleCancel = () => {
    setSelectedFile(null);
    onClose(null);
  };

  const handleAccept = () => {
    setSelectedFile(null);
    onClose(selectedFile);
  };

  const uploadInputRef = useRef<HTMLInputElement>(null);
  const dialogLabel = "upload-file-dialog";

  return (
    <NeptyneDialog
      open={open}
      onClose={handleCancel}
      onConfirm={handleAccept}
      ariaLabel={dialogLabel}
      fullWidth={true}
      maxWidth="xs"
    >
      <DialogTitle id={dialogLabel}>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{prompt}</DialogContentText>
        <div>
          <input
            ref={uploadInputRef}
            type="file"
            accept={accept}
            style={{ display: "none" }}
            onChange={(event) => {
              if (event.target.files) {
                setSelectedFile(event.target.files[0]);
              }
            }}
          />
          <span>{selectedFile ? selectedFile.name : ""}</span>
          <Button
            onClick={() => uploadInputRef.current && uploadInputRef.current.click()}
            variant="contained"
          >
            SELECT
          </Button>
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel} color="primary">
          Cancel
        </Button>
        <Button onClick={handleAccept} color="primary" disabled={selectedFile === null}>
          OK
        </Button>
      </DialogActions>
    </NeptyneDialog>
  );
};
