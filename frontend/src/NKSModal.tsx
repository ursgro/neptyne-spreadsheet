import { useCallback, useEffect, useState } from "react";
import DialogContentText from "@mui/material/DialogContentText";
import DialogContent from "@mui/material/DialogContent";
import Dialog from "@mui/material/Dialog";
import Button from "@mui/material/Button";
import { Box, DialogActions, Divider, Typography } from "@mui/material";
import { useUserInfo } from "./user-context";
import { getGSheetAppConfig } from "./gsheet_app_config";

interface Props {
  open: boolean;
  onClose: () => void;
  connectToKernel: (name: string) => void;
}

interface ConnectionProps {
  name: string;
  onConnect: (name: string) => void;
}

const Connection = ({ name, onConnect }: ConnectionProps) => {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "4px",
      }}
    >
      <Typography variant="h2" paddingRight="8px">
        {name}
      </Typography>
      <Button onClick={() => onConnect(name)}>Connect</Button>
    </div>
  );
};

const CopyableCommand = ({ command }: { command: string }) => {
  const onCopy = () => navigator.clipboard.writeText(command);
  return (
    <div
      style={{
        padding: "3px",
        position: "relative",
        backgroundColor: "#f5f5f5",
      }}
    >
      <pre style={{ overflow: "auto", margin: "6px" }}>{command}</pre>
      <div style={{ position: "absolute", right: 0, bottom: -2 }}>
        <Button size="small" onClick={onCopy}>
          Copy
        </Button>
      </div>
    </div>
  );
};

const NKSModal = ({ open, onClose, connectToKernel }: Props) => {
  const [nksConnectionToken, setNksConnectionToken] = useState("");
  const [activeConnections, setActiveConnections] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { fetch: authFetch } = useUserInfo();

  useEffect(() => {
    authFetch !== null &&
      authFetch("/api/nks/token")
        .then((res) => {
          if (res.ok) {
            res.text().then((data) => {
              setNksConnectionToken(data);
            });
          } else {
            onClose();
          }
        })
        .catch((error) => {
          setError(error.toString());
        });
  }, [authFetch, onClose]);

  useEffect(() => {
    const handle = window.setInterval(() => {
      authFetch !== null &&
        authFetch("/api/nks/connections").then((res) => {
          if (res.ok) {
            res.json().then((data) => {
              const connections = data["connections"];
              setActiveConnections(connections);
            });
          }
        });
    }, 1000);
    return () => {
      window.clearInterval(handle);
    };
  }, [authFetch]);

  let command = "python -m neptyne_kernel.nks.main";

  const { serverUrlBase } = getGSheetAppConfig();
  const host = new URL(serverUrlBase || window.location.hostname).hostname;
  if (host !== "app.neptyne.com") {
    command += ` --host ${host}`;
    if (host === "localhost") {
      // it's usually true...
      command += ":8877";
    }
  }
  command += ` ${nksConnectionToken}`;

  const onConnect = useCallback(
    (name: string) => {
      onClose();
      connectToKernel(name);
    },
    [connectToKernel, onClose]
  );

  let content;
  if (error) {
    content = <div>Failed to reach Neptyne: {error}</div>;
  } else if (!nksConnectionToken) {
    content = <div>Loading...</div>;
  } else {
    content = (
      <>
        <Typography variant="h1">Active connections:</Typography>
        <Box padding="5px">
          {(activeConnections.length > 0 &&
            activeConnections.map((connection) => (
              <Connection key={connection} name={connection} onConnect={onConnect} />
            ))) || (
            <DialogContentText>
              No active connections. Run the command above to connect to Neptyne.
            </DialogContentText>
          )}
        </Box>
        <Divider />
        <DialogContentText>
          First ensure you have neptyne-kernel installed
          <CopyableCommand command="pip install neptyne-kernel" />
          Run the following command to start the service and connect to Neptyne:
          <CopyableCommand command={command} />
        </DialogContentText>
      </>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth={"sm"} fullWidth>
      <DialogContent>{content}</DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="primary">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default NKSModal;
