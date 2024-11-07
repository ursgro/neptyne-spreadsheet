import { OpenInNew as OpenInNewIcon, Menu as MenuIcon } from "@mui/icons-material";
import {
  Badge,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Box,
  IconButton,
  ListItemText,
  Menu,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import React, { ReactNode, useEffect, useMemo, useState } from "react";
import { getGSheetAppConfig } from "../gsheet_app_config";
import { useViewState } from "../view-state";
import { GetStartedGSheets } from "./GetStartedGSheets";
import { ReleaseNotes } from "./ReleaseNotes";
import { useUserInfo } from "../user-context";
import { aiSubmit } from "./NeptyneNotebook";
import { SheetData } from "../NeptyneProtocol";
import NKSModal from "../NKSModal";

interface GSheetMenuProps {
  openNewWindow?: () => void;
  thinking: (msg: string | null) => void;
  codeStatusIcon: JSX.Element | null;
  onInsertSnippet: (msg: string, code: string) => void;
  emptyCodePanel: boolean;
  connectToKernel: (name: string) => void;
}

interface Action {
  icon: JSX.Element;
  tooltip: React.ReactNode;
  handler: () => void;
  showWhenPoppedOut: boolean;
  badge?: ReactNode;
}

const AISnippetPrompt = (props: {
  onSubmit: (prompt: string | null, sheetData: SheetData | null) => void;
}) => {
  const [prompt, setPrompt] = useState<string>("");
  const [sheetData, setSheetData] = useState<SheetData | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      google.script.run
        .withSuccessHandler((result: any) => {
          setSheetData(result);
        })
        .getSheetData();
    };
    fetchData();
  }, []);

  const handleSubmit = () => {
    props.onSubmit(prompt, sheetData);
  };
  return (
    <Dialog
      open={true}
      onClose={() => props.onSubmit(null, null)}
      sx={{
        "& .MuiDialog-paper": {
          margin: "8px",
        },
        "& .MuiDialogTitle-root": {
          padding: "12px",
        },
        "& .MuiDialogContent-root": {
          padding: "12px",
        },
      }}
    >
      <DialogTitle>Get Started with an AI Prompt</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Enter a prompt to get started with an AI-generated code snippet.
        </DialogContentText>
        <TextField
          autoFocus
          required
          margin="dense"
          fullWidth
          rows={5}
          multiline
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Fetch a list of all countries in the world from Wikipedia."
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleSubmit}>Submit</Button>
      </DialogActions>
    </Dialog>
  );
};

export default function GSheetSpeedMenu(props: GSheetMenuProps) {
  const { openNewWindow, thinking, codeStatusIcon, onInsertSnippet, emptyCodePanel } =
    props;

  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  const { poppedOut } = getGSheetAppConfig();

  const [releaseNotes, setReleaseNotes] = useState<string | null>(null);

  const latestRelease = useMemo(() => {
    const lines = releaseNotes?.split("\n") ?? [];
    const h2 = lines.find((line) => line.startsWith("## "));
    return h2?.slice(3) ?? "unknown";
  }, [releaseNotes]);

  const [viewState, updateViewState] = useViewState();
  const { fetch: authFetch } = useUserInfo();
  const [showAI, setShowAI] = useState(false);

  useEffect(() => {
    const { serverUrlBase } = getGSheetAppConfig();
    fetch(serverUrlBase + "/api/release_notes?format=markdown")
      .then((response) => response.text())
      .then((text) => setReleaseNotes(text))
      .catch(console.error);
  }, []);

  const [showGetStartedMenu, setShowGetStartedMenu] = React.useState<
    "default" | "show" | "hide"
  >("default");
  const [showReleaseNotes, setShowReleaseNotes] = React.useState(false);
  const [showNKSModal, setShowNKSModal] = React.useState(false);

  const handleShowGetStarted = React.useCallback(() => {
    setShowGetStartedMenu("show");
  }, []);

  const handleCloseGetStarted = React.useCallback(
    (showAgain: boolean) => {
      setShowGetStartedMenu("hide");
      updateViewState({ showGetStartedOnNewSheet: showAgain });
    },
    [updateViewState]
  );

  const handleShowAIPrompt = React.useCallback(() => {
    setShowAI(true);
  }, []);

  const handleSubmitAIPrompt = React.useCallback(
    (prompt: string | null, sheetData: SheetData | null) => {
      if (prompt !== null && prompt.trim().length > 0 && authFetch !== null) {
        aiSubmit(prompt, thinking, authFetch, onInsertSnippet, sheetData);
      }
      setShowAI(false);
    },
    [authFetch, onInsertSnippet, thinking]
  );

  const handleShowReleaseNotes = React.useCallback(() => {
    setShowReleaseNotes(true);
  }, []);

  const handleCloseReleaseNotes = React.useCallback(() => {
    setShowReleaseNotes(false);
    updateViewState({ latestReleaseNotesViewed: latestRelease });
  }, [latestRelease, updateViewState]);

  const handleMenuClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const callSheetsWhileThinking = (
    method: keyof typeof google.script.run,
    msg: string
  ) => {
    return () => {
      thinking(msg);
      const doneThinking = () => {
        thinking(null);
      };
      google.script.run
        .withSuccessHandler(doneThinking)
        .withFailureHandler(doneThinking)
        [method]();
    };
  };

  const openNKSModal = React.useCallback(() => {
    setShowNKSModal(true);
  }, []);

  const actions: Action[] = [
    {
      icon: (
        <Typography variant="body1" style={{ fontWeight: "bold" }}>
          📦
        </Typography>
      ),
      tooltip: "Install Python Packages",
      handler: callSheetsWhileThinking(
        "showPackageManagement",
        "Loading package manager"
      ),
      showWhenPoppedOut: false,
    },
    {
      icon: (
        <Typography variant="body1" style={{ fontWeight: "bold" }}>
          🔐
        </Typography>
      ),
      tooltip: "Manage Secrets",
      handler: callSheetsWhileThinking("showSecretsManagement", "Loading secrets"),
      showWhenPoppedOut: false,
    },
    {
      icon: (
        <Typography variant="body1" style={{ fontWeight: "bold" }}>
          🚀️
        </Typography>
      ),
      tooltip: "Manage Advanced Features",
      handler: callSheetsWhileThinking(
        "showAdvancedFeatures",
        "Loading feature manager"
      ),
      showWhenPoppedOut: false,
    },
    {
      icon: (
        <Typography variant="body1" style={{ fontWeight: "bold" }}>
          📚
        </Typography>
      ),
      tooltip: "Tutorial",
      handler: callSheetsWhileThinking("showTutorial", "Help is on the way"),
      showWhenPoppedOut: false,
    },
    {
      icon: (
        <Typography variant="body1" style={{ fontWeight: "bold" }}>
          💡
        </Typography>
      ),
      tooltip: "Get Started",
      handler: handleShowGetStarted,
      showWhenPoppedOut: true,
    },
    {
      icon: (
        <Typography variant="body1" style={{ fontWeight: "bold" }}>
          📄
        </Typography>
      ),
      tooltip: "Release Notes",
      handler: handleShowReleaseNotes,
      showWhenPoppedOut: true,
      badge:
        releaseNotes !== null && latestRelease !== viewState.latestReleaseNotesViewed
          ? "NEW"
          : 0,
    },
    {
      icon: (
        <Typography variant="body1" style={{ fontWeight: "bold" }}>
          ⚙️
        </Typography>
      ),
      tooltip: "Environment Variables",
      handler: callSheetsWhileThinking("showEnvironmentVariables", "Opening..."),
      showWhenPoppedOut: true,
    },
    {
      icon: (
        <Typography variant="body1" style={{ fontWeight: "bold" }}>
          🧑‍💻
        </Typography>
      ),
      tooltip: "Connect Local Kernel",
      handler: openNKSModal,
      showWhenPoppedOut: true,
    },
  ];

  const showPoppedOut = (action: Action) => {
    return action.showWhenPoppedOut || !poppedOut;
  };

  const showGetStartedOnNewSheet =
    viewState.showGetStartedOnNewSheet === undefined ||
    viewState.showGetStartedOnNewSheet;

  const doShowGetStartedMenu =
    showGetStartedMenu === "show" ||
    (showGetStartedOnNewSheet && showGetStartedMenu === "default" && emptyCodePanel);

  return (
    <div
      style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
    >
      <IconButton onClick={handleMenuClick}>
        <Badge
          color="secondary"
          variant="dot"
          badgeContent={actions.reduce(
            (acc, action) =>
              acc + (showPoppedOut(action) ? Number(!!action.badge) || 0 : 0),
            0
          )}
        >
          <MenuIcon />
        </Badge>
      </IconButton>
      <Menu anchorEl={anchorEl} open={open} onClose={handleMenuClose}>
        {actions.filter(showPoppedOut).map((action, index) => (
          <MenuItem
            key={index}
            onClick={() => {
              action.handler();
              handleMenuClose();
            }}
          >
            <Box marginRight="1rem" sx={{ color: "rgba(0,0,0,1)" }}>
              {action.icon}
            </Box>
            <Badge color="secondary" badgeContent={action.badge || 0}>
              <ListItemText primary={action.tooltip} />
            </Badge>
          </MenuItem>
        ))}
      </Menu>
      <div style={{ display: "flex", alignItems: "center" }}>
        {codeStatusIcon}
        {openNewWindow && (
          <IconButton
            onClick={openNewWindow}
            style={{
              marginLeft: 8,
              border: "1px solid rgba(0, 0, 0, 0.23)",
              borderRadius: "4px",
              padding: "4px",
              margin: "2px 0",
            }}
          >
            <Typography variant="body1">Pop Out</Typography>
            <OpenInNewIcon style={{ marginLeft: 4 }} />
          </IconButton>
        )}
      </div>
      {doShowGetStartedMenu && (
        <GetStartedGSheets
          showOnStartDefault={showGetStartedOnNewSheet}
          insertSnippet={onInsertSnippet}
          onClose={handleCloseGetStarted}
          onShowAIPrompt={handleShowAIPrompt}
        />
      )}
      {showReleaseNotes && (
        <ReleaseNotes releaseNotes={releaseNotes} onClose={handleCloseReleaseNotes} />
      )}
      {showNKSModal && (
        <NKSModal
          open={showNKSModal}
          onClose={() => setShowNKSModal(false)}
          connectToKernel={props.connectToKernel}
        />
      )}
      {showAI && <AISnippetPrompt onSubmit={handleSubmitAIPrompt} />}
    </div>
  );
}
