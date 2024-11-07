import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { useCallback, useEffect, useState } from "react";
import {
  fetchGSheetAuthTokenFromServer,
  openCodeEditor,
} from "./neptyne-container/appsScript";
import { getGSheetAppConfig } from "./gsheet_app_config";
import { Backdrop, Box, CircularProgress, Modal } from "@mui/material";
import Paper from "@mui/material/Paper";
import * as React from "react";

const MARKETPLACE_URL =
  "https://workspace.google.com/marketplace/app/neptyne_python_for_sheets/891309878867";

const { serverUrlBase, authToken } = getGSheetAppConfig();

export type ButtonTuple = [string, string, string | null];

interface ButtonPanelProps {
  buttons: ButtonTuple[];
  onClick: (id: string) => Promise<void>;
  disabled?: boolean;
}

interface ActionButtonProps {
  onClick: () => Promise<void>;
  caption: string;
  description: string | null;
  disabled?: boolean;
}

const ActionButton = ({
  onClick,
  caption,
  description,
  disabled,
}: ActionButtonProps) => {
  const [busy, setBusy] = useState(false);
  const handleClick = useCallback(() => {
    setBusy(true);
    onClick().finally(() => {
      setBusy(false);
    });
  }, [onClick, setBusy]);

  return (
    <Paper sx={{ padding: "8px", margin: "8px" }}>
      <Stack>
        <Button
          variant="contained"
          onClick={handleClick}
          disabled={disabled || busy}
          sx={{ minHeight: "42px" }}
        >
          {busy ? <CircularProgress size="24px" /> : caption}
        </Button>
        {description && <Box padding="2px">{description}</Box>}
      </Stack>
    </Paper>
  );
};

export const ButtonPanel = (props: ButtonPanelProps) => {
  const { buttons, onClick, disabled } = props;

  return (
    <div>
      {buttons.map((button) => {
        const [id, caption, description] = button;
        return (
          <ActionButton
            key={id}
            onClick={() => onClick(id)}
            caption={caption}
            description={description}
            disabled={disabled}
          />
        );
      })}
    </div>
  );
};

const Logo = () => (
  <img
    src="https://app.neptyne.com/img/logo.svg"
    alt="Neptyne logo"
    style={{ width: "100%", padding: "4px" }}
  />
);

const AuthPrompt = () => (
  <Modal
    open={true}
    sx={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      margin: "4px",
    }}
  >
    <Paper>
      <Stack>
        <Box padding="8px">
          <Logo />
        </Box>
        <Box padding="4px">
          Authorize the Neptyne extension to use this sheet's actions.
        </Box>
        <Button
          onClick={() => {
            window.open(MARKETPLACE_URL);
          }}
        >
          Install the Extension
        </Button>
      </Stack>
    </Paper>
  </Modal>
);

const GSheetsButtonSidePanel = () => {
  const [gSheetToken, setGSheetToken] = useState<string | null>(null);
  const [buttons, setButtons] = useState<ButtonTuple[] | null>(null);
  const [loading, setLoading] = useState<Boolean>(true);

  useEffect(() => {
    const tokenFetch = fetchGSheetAuthTokenFromServer()
      .then((token) => setGSheetToken(token))
      .catch((e) => {});
    const buttonFetch = fetch(`${serverUrlBase}/api/v1/gsheet_handler`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({
        token: authToken,
        expression: "N_.get_buttons",
        code: null,
        requirements: null,
        cell: null,
        noCache: true,
      }),
    })
      .then((res) => res.json())
      .then((res) => {
        setButtons(res);
      })
      .catch((e) => {
        console.error(e);
      });
    Promise.all([tokenFetch, buttonFetch]).then(() => setLoading(false));
  }, []);

  const showCodeEditor = useCallback(() => {
    setLoading(true);
    openCodeEditor();
  }, []);

  if (loading) {
    return (
      <Backdrop
        sx={{ color: "#fff", zIndex: (theme) => theme.zIndex.drawer + 10 }}
        open={true}
      >
        <CircularProgress color="inherit" />
      </Backdrop>
    );
  }

  const clickHandler = async (id: string) => {
    try {
      const response = await fetch(`${serverUrlBase}/api/v1/gsheet_handler`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({
          token: gSheetToken,
          expression: `N_.handle_button_click("${id}")`,
          code: null,
          requirements: null,
          cell: null,
          noCache: true,
        }),
      });
      const result = await response.json();
      if (result.ename) {
        console.error(result.message);
      } else if (
        response.headers.get("Content-Type") === "application/vnd.neptyne.download+json"
      ) {
        const { value, mimetype, name } = result;
        const decoded = window.atob(value);
        const blob = new Blob([decoded], { type: mimetype });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (!buttons || buttons.length === 0) {
    return (
      <Paper>
        <Stack padding="8px" spacing={1}>
          <Logo />
          <Box paddingY="12px">
            Welcome! This sheet uses <b>Neptyne</b>, a Python add-on for Google Sheets.
          </Box>
          <Button variant="contained" onClick={showCodeEditor}>
            Click to Show Code Editor
          </Button>
          <Button onClick={() => window.open("https://neptyne.com/google-sheets")}>
            Learn More
          </Button>
        </Stack>
      </Paper>
    );
  }

  return (
    <Stack height="100vh">
      {!gSheetToken && <AuthPrompt />}
      <Box padding="4px">
        <Logo />
      </Box>
      <Box>
        <ButtonPanel buttons={buttons} onClick={clickHandler} disabled={!gSheetToken} />
      </Box>
      <Box flexGrow={1} height="100%"></Box>
      <Box alignSelf="flex-end">
        Created using&nbsp;
        <a href={MARKETPLACE_URL} target="_blank" rel="noreferrer">
          Neptyne
        </a>
      </Box>
    </Stack>
  );
};

export default GSheetsButtonSidePanel;
