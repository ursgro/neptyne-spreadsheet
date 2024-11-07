import React, { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import { getGSheetAppConfig } from "./gsheet_app_config";
import { Dialog, IconButton, InputAdornment, Switch, TextField } from "@mui/material";
import { FileCopy } from "@mui/icons-material";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import Divider from "@mui/material/Divider";
import authenticatedFetch from "./authenticatedFetch";
import { User } from "./user-context";

interface GSheetsAdvancedFeaturesProps {
  user: User;
  onClose: () => void;
}

type AuthStatus = undefined | true | false;

const NGROK_HEADERS = {
  "ngrok-skip-browser-warning": "true",
};

const OAuthUrl = (action: string, user: User) => {
  const { serverUrlBase, authToken } = getGSheetAppConfig();
  const base = (serverUrlBase || "") + "/api/oauth_handler";
  const state = JSON.stringify({
    authToken: authToken || "",
    firebaseUid: user.uid,
    action,
  });
  const params = new URLSearchParams({
    state,
  });
  return base + "?" + params.toString();
};

const style = {
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  height: "800px",
  bgcolor: "background.paper",
  p: 4,
};
const GSheetsAdvancedFeatures: React.FC<GSheetsAdvancedFeaturesProps> = ({
  onClose,
  user,
}) => {
  const [authStatus, setAuthStatus] = useState<AuthStatus | undefined>(undefined);
  const [apiKey, setApiKey] = useState("");
  const [removeApiDialog, setRemoveApiDialog] = useState(false);

  const fetchAPIKey = useCallback(() => {
    const url = `/api/tyne_api_key`;
    if (user) {
      authenticatedFetch(user, url, {
        method: "GET",
      }).then((response) => {
        if (response.ok) {
          response.json().then((body) => {
            setApiKey(body.key);
          });
        }
      });
    }
  }, [user]);

  const deleteAPIKey = useCallback(() => {
    const url = `/api/tyne_api_key`;
    if (user) {
      authenticatedFetch(user, url, {
        method: "DELETE",
      }).then((response) => {
        if (response.ok) {
          response.json().then((body) => {
            setApiKey("");
            setRemoveApiDialog(false);
          });
        }
      });
    }
  }, [user]);

  const createAPIKey = useCallback(() => {
    const url = `/api/tyne_api_key`;
    if (user) {
      authenticatedFetch(user, url, {
        method: "PUT",
      }).then((response) => {
        if (response.ok) {
          response.json().then((body) => {
            setApiKey(body.key);
          });
        }
      });
    }
  }, [user]);

  const fetchAuthStatus = useCallback(() => {
    fetch(OAuthUrl("status", user), { headers: NGROK_HEADERS }).then(
      (response) => {
        if (response.ok) {
          response.json().then((data: any) => {
            setAuthStatus(data.authenticated);
          });
        } else {
          console.error("Error fetching auth status:", response.statusText);
        }
      },
      (reason) => {
        console.error("Error fetching auth status:", reason);
      }
    );
  }, [user]);

  const handleAuthAction = () => {
    if (authStatus === undefined) {
      return;
    }
    if (authStatus) {
      fetch(OAuthUrl("remove", user), {
        headers: NGROK_HEADERS,
        method: "DELETE",
      }).then(() => {
        fetchAuthStatus();
      });
    } else {
      window.open(OAuthUrl("start", user), "_blank");
    }
  };

  const handleToggleApiAccess = () => {
    if (apiKey) {
      setRemoveApiDialog(true);
    } else {
      createAPIKey();
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(apiKey);
  };

  const handleConfirmDisable = () => {
    deleteAPIKey();
  };

  const handleCloseDialog = () => {
    setRemoveApiDialog(false);
  };

  useEffect(() => {
    fetchAuthStatus();

    const interval = setInterval(fetchAuthStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchAuthStatus]);

  useEffect(() => {
    fetchAPIKey();
  }, [fetchAPIKey]);

  const enableBetaFeatures = useCallback((event: KeyboardEvent) => {
    if (event.metaKey && event.code === "Digit0") {
      event.preventDefault();
      google.script.run.enableBetaFeaturesLDBP();
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", enableBetaFeatures);
    return () => {
      window.removeEventListener("keydown", enableBetaFeatures);
    };
  }, [enableBetaFeatures]);

  const reasons = (
    <ul>
      <li>
        <b>Allowing Python to write and read cells not passed into a function</b>
        <br />
        Google Sheets only allows custom functions only access to the values passed. But
        being able to read any value is useful; writing to the sheet is useful for when
        you do something expensive and don't want to re-run it every time.
      </li>
      <li>
        <b>Making Python graphs appear in Google Sheets</b>
        <br />
        We use this access to write images to your spreadsheet on your behalf. You can't
        return images from custom functions in Google Sheets.
      </li>
      <li>
        <b>Streamlit Support</b>
        <br />
        Create Streamlit apps that read and write to your Google Sheet. These apps can
        be used both win your sheet and outside of it.
      </li>
    </ul>
  );
  return (
    <Box sx={style}>
      <Typography sx={{ mt: 2 }}>
        {authStatus ? (
          <span>
            <p>
              Thank you for authorizing! You can close this window now, or use it to
              revoke authorization.
            </p>
            <p>
              Keep in mind that revoking this authorization will mean that you will not
              be able to use advanced features in Neptyne until you re-authorize.
            </p>
            <Divider></Divider>
            <Box sx={{ mt: 4 }}>
              <Typography variant="h6">Enable API access to this Tyne</Typography>

              <Switch
                sx={{
                  "& .MuiSwitch-switchBase": {
                    color: "#b0bec5",
                  },
                  "& .MuiSwitch-track": {
                    backgroundColor: "#b0bec5",
                  },
                  "& .MuiSwitch-switchBase.Mui-checked": {
                    color: "#78909c",
                  },
                  "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                    backgroundColor: "#78909c",
                  },
                }}
                checked={!!apiKey}
                onChange={handleToggleApiAccess}
              />
              <Button>
                <a
                  href="https://www.neptyne.com/google-sheets-how-tos/neptyne-api"
                  target="_blank"
                  rel="noreferrer"
                >
                  Learn more
                </a>
              </Button>

              {apiKey && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body1">
                    API access is enabled. Use the key below:
                  </Typography>
                  <TextField
                    fullWidth
                    variant="outlined"
                    value={`****${apiKey.slice(-4)}`}
                    InputProps={{
                      readOnly: true,
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton onClick={copyToClipboard}>
                            <FileCopy />
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                </Box>
              )}
            </Box>
            <Dialog open={removeApiDialog} onClose={handleCloseDialog}>
              <DialogTitle>Disable API Access</DialogTitle>
              <DialogContent>
                <DialogContentText>
                  This API key will be deleted, and all future requests with this key
                  will be denied.
                </DialogContentText>
              </DialogContent>
              <DialogActions>
                <Button onClick={handleCloseDialog}>Cancel</Button>
                <Button onClick={handleConfirmDisable} color="primary">
                  OK
                </Button>
              </DialogActions>
            </Dialog>
          </span>
        ) : (
          <span>
            To enable advanced features in Neptyne, we require extra authorization.
            These features include:
            {reasons}
            Neptyne only uses this access to allow your scripts to interact with your
            sheet. We do not collect or store data from your sheet, or access it in any
            way outside of the code you write here. Your data is never shared with third
            parties.
          </span>
        )}
      </Typography>
      <Box
        sx={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          mt: 2,
          position: "absolute",
          top: "380px",
          left: "400px",
        }}
      >
        <Button
          variant="contained"
          color="primary"
          sx={{ mt: 3 }}
          onClick={handleAuthAction}
          disabled={authStatus === undefined}
        >
          {authStatus !== undefined
            ? authStatus
              ? "De-Authorize"
              : "Authenticate"
            : "Loading..."}
        </Button>
        &nbsp;
        <Button variant="outlined" sx={{ mt: 3 }} onClick={onClose} color="secondary">
          Cancel
        </Button>
      </Box>
    </Box>
  );
};

export default GSheetsAdvancedFeatures;
