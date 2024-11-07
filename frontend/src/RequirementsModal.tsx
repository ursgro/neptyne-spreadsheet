import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import { TextField } from "@mui/material";
import { useCallback, useState } from "react";
import DialogContentText from "@mui/material/DialogContentText";
import { StreamHandler } from "./KernelSession";
import Typography from "@mui/material/Typography";

interface Props {
  open: boolean | "fullScreen";
  requirements: string;
  onClose: () => void;
  onRun: (requirements: string, onStream: StreamHandler) => void;
}

interface Stream {
  error: boolean;
  text: string;
}

const RequirementsModal = (props: Props) => {
  const { open, onClose, onRun } = props;
  let { requirements } = props;

  const [requirementsText, setRequirementsText] = useState<string | null>(null);
  const [running, setRunning] = useState<boolean>(false);
  const [outStream, setOutStream] = useState<Stream[]>([]);

  const onStream = useCallback((error: boolean, text: string, final: boolean) => {
    if (final) {
      setRunning(false);
    } else {
      setOutStream((outStream) => [...outStream, { error, text }]);
    }
  }, []);

  const dirty = requirements !== requirementsText && requirementsText !== null;

  requirements = requirementsText === null ? requirements : requirementsText;

  const handleRun = () => {
    setRunning(true);
    setOutStream([]);
    onRun(requirements, onStream);
  };

  return (
    <Dialog
      open={!!open}
      onClose={() => running || onClose()}
      maxWidth={"sm"}
      fullWidth
      disableEscapeKeyDown={running}
      fullScreen={open === "fullScreen"}
    >
      <DialogTitle>Manage Python dependencies</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Add project dependencies here. Anything you enter will be pip installed.
        </DialogContentText>
        <TextField
          value={requirements}
          multiline
          fullWidth
          rows={open === "fullScreen" ? 12 : 8}
          onChange={(event) => setRequirementsText(event.target.value)}
        >
          {requirements}
        </TextField>
        <Typography>
          {running ? "Installing..." : outStream.length > 0 ? "Output:" : null}
        </Typography>
        <div style={{ overflow: "scroll" }}>
          {outStream.map((stream, ix) => (
            <div
              key={ix}
              style={{ backgroundColor: stream.error ? "#fdd" : undefined }}
            >
              <pre>{stream.text}</pre>
            </div>
          ))}
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleRun} disabled={running || !dirty}>
          Apply
        </Button>
        <Button onClick={onClose} disabled={running}>
          {dirty ? "Cancel" : "Close"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RequirementsModal;
