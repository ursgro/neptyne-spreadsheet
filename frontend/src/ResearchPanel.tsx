import React, { useCallback, useEffect, useState } from "react";
import {
  AppBar,
  Box,
  Button,
  CircularProgress,
  IconButton,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import authenticatedFetch from "./authenticatedFetch";
import Paper from "@mui/material/Paper";
import { CellChangeWithRowCol } from "./neptyne-sheet/NeptyneSheet";
import { ResearchError, ResearchMessage, ResearchTable } from "./NeptyneProtocol";
import {
  extractResearchTableFromSheet,
  Prefill,
  prefills,
  SimpleCell,
  updateSheetWithResearchTable,
} from "./aiResearch";
import {
  parseSheetSelection,
  selectionToA1,
  SheetLocation,
  SheetSelection,
} from "./SheetUtils";
import { getGSheetAppConfig } from "./gsheet_app_config";
import Markdown from "react-markdown";
import { User } from "./user-context";

export interface GridAndSelection {
  grid: SimpleCell[][];
  selectionWidth: number;
  selectionHeight: number;
}

// Information associated with a research session not reconstructable from the sheet
export interface ResearchMetaData {
  table: SheetSelection;
  prompt: string;
}

interface ResearchPanelProps {
  user: User;
  sheet: number;
  metaData: ResearchMetaData;
  onClose: (() => void) | null;
  sheetSelection: SheetSelection;
  onUpdateSheetSelection: (selection: SheetSelection) => void;
  onUpdateCellValues: (updates: CellChangeWithRowCol[]) => void;
  onShowError: (message: string) => void;
  onUpdateMetaData: (newValue: ResearchMetaData, prevValue: ResearchMetaData) => void;
  fetchGrid: (sheet: number) => Promise<GridAndSelection>;
}

const ResearchPanel: React.FC<ResearchPanelProps> = ({
  onClose,
  sheet,
  metaData,
  sheetSelection,
  onUpdateSheetSelection,
  user,
  onUpdateCellValues,
  onShowError,
  onUpdateMetaData,
  fetchGrid,
}) => {
  const [prompt, setPrompt] = useState(metaData.prompt || "");
  const [cellRange, setCellRange] = useState("");
  const [cellRangeError, setCellRangeError] = useState<string | null>(null);

  const [messages, setMessages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const [showPrefillMenu, setShowPrefillMenu] = useState(false);
  const [cancelController, setCancelController] = useState<AbortController | null>(
    null
  );

  useEffect(() => {
    setCellRange(selectionToA1(sheetSelection));
  }, [sheetSelection]);

  const handleCellRangeChange = (newRange: string) => {
    setCellRange(newRange);
    const selection = parseSheetSelection(newRange);
    // Check if any field in the selection is NaN
    if (
      isNaN(selection.start.col) ||
      isNaN(selection.start.row) ||
      isNaN(selection.end.col) ||
      isNaN(selection.end.row) ||
      selection.start.col > selection.end.col ||
      selection.start.row > selection.end.row
    ) {
      setCellRangeError("Invalid cell range");
    } else {
      onUpdateSheetSelection(selection);
      setCellRangeError(null);
    }
  };

  const log = (msg: string) => {
    setMessages((logs) => [...logs, msg]);
  };

  const processDoc = (doc: string, cellRef: SheetLocation) => {
    doc = doc.trim();
    if (!doc) {
      return;
    }
    const item: ResearchMessage | ResearchTable | ResearchError = JSON.parse(doc);

    if ("msg" in item) {
      log(item.msg);
    } else if ("error" in item) {
      onShowError(item.error);
    } else if ("table" in item) {
      updateSheetWithResearchTable(item, cellRef, onUpdateCellValues, sheet);
    }
  };

  const callResearchServer = async () => {
    onUpdateMetaData({ table: sheetSelection, prompt }, metaData);
    const cellRef = { ...sheetSelection.start };
    const abortController = new AbortController();
    setCancelController(abortController);

    const reader = new ReadableStream({
      async start(streamController) {
        setBusy(true);
        if (getGSheetAppConfig().inGSMode) {
          log("Preprocessing data");
        }
        const { grid, selectionWidth, selectionHeight } = await fetchGrid(sheet);
        const researchTable = extractResearchTableFromSheet(
          grid,
          0,
          0,
          selectionWidth,
          selectionHeight
        );

        try {
          const params: { [key: string]: any } = {
            prompt,
            researchTable,
          };

          const response = await authenticatedFetch(user, "/api/research", {
            signal: abortController.signal,
            method: "POST",
            body: JSON.stringify(params),
          });

          const body = response.body;
          if (body === null) {
            throw new Error("Stream reading failed: body is empty");
          }
          const reader = body.getReader();
          let decoder = new TextDecoder();
          let soFar = "";

          while (true) {
            let { value: chunk, done } = await reader.read();
            if (chunk) {
              soFar += decoder.decode(chunk, { stream: true });
              const lines = soFar.split("\n");
              soFar = lines.pop() || "";
              for (const line of lines) {
                processDoc(line, cellRef);
              }
            }
            if (done) {
              if (soFar) {
                processDoc(soFar, cellRef);
              }
              break;
            }
          }
          streamController.close();
          reader.releaseLock();
        } catch (error) {
          console.error("Stream reading failed:", error);
          streamController.error(error);
        } finally {
          setBusy(false);
          setCancelController(null);
        }
      },
    });

    new Response(reader).text();
  };

  const handleCancel = () => {
    if (cancelController) {
      cancelController.abort();
      setCancelController(null);
    }
  };

  const togglePrefillMenu = useCallback(
    (event: KeyboardEvent) => {
      if (event.metaKey && event.code === "Digit0") {
        event.preventDefault(); // Prevent the default action of the shortcut
        setShowPrefillMenu(!showPrefillMenu);
      }
    },
    [showPrefillMenu]
  );

  useEffect(() => {
    window.addEventListener("keydown", togglePrefillMenu);
    return () => {
      window.removeEventListener("keydown", togglePrefillMenu);
    };
  }, [togglePrefillMenu]);

  const applyPrefill = (prefill: Prefill) => {
    setPrompt(prefill.prompt);
    let changes: CellChangeWithRowCol[] = [];
    for (let i = 0; i < prefill.headers.length; i++) {
      changes.push({
        row: sheetSelection.start.row,
        col: sheetSelection.start.col + i,
        value: prefill.headers[i],
      });
    }
    onUpdateCellValues(changes);
    onUpdateSheetSelection({
      start: { ...sheetSelection.start },
      end: {
        col: sheetSelection.start.col + prefill.headers.length - 1,
        row: sheetSelection.start.row + prefill.count,
      },
    });
    setShowPrefillMenu(false);
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        padding: 1,
        width: "100%",
      }}
    >
      {onClose && (
        <AppBar position="static">
          <Toolbar variant="dense">
            <IconButton
              edge="start"
              color="inherit"
              aria-label="close"
              onClick={() => onClose()}
            >
              <CloseIcon />
            </IconButton>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              Research Panel
            </Typography>
          </Toolbar>
        </AppBar>
      )}
      <Paper elevation={3} sx={{ flex: 1, padding: 1, overflow: "auto" }}>
        Select the cells where you want to insert the research results. The first row
        will be used as headers. Then type your prompt and press "Do research".
      </Paper>
      <TextField
        label="Prompt"
        variant="outlined"
        fullWidth
        margin="dense"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <TextField
        label="Cell Range"
        variant="outlined"
        error={Boolean(cellRangeError)}
        helperText={cellRangeError || ""}
        fullWidth
        margin="dense"
        value={cellRange}
        onChange={(e) => handleCellRangeChange(e.target.value)}
      />
      <Box sx={{ display: "flex", flexDirection: "row", gap: 1, marginBottom: 2 }}>
        <Button
          variant="contained"
          fullWidth={!busy}
          onClick={callResearchServer}
          disabled={cellRangeError !== null || busy || prompt === ""}
          color="primary"
          sx={{ flexGrow: busy ? 1 : 0 }}
        >
          {busy ? <CircularProgress size={24} /> : "Do research"}
        </Button>
        {busy && (
          <Button variant="outlined" onClick={handleCancel} color="primary">
            Cancel
          </Button>
        )}
      </Box>
      {showPrefillMenu && (
        <Paper elevation={3} sx={{ position: "absolute", zIndex: 1, padding: 2 }}>
          {prefills.map((prefill, index) => (
            <>
              <Button key={index} onClick={() => applyPrefill(prefill)}>
                {prefill.prompt}
              </Button>
              <br />
            </>
          ))}
        </Paper>
      )}
      <Box
        sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}
      >
        <Paper
          elevation={3}
          sx={{ flex: 1, marginTop: 1, padding: 1, overflow: "auto" }}
        >
          {messages.map((log, index) => (
            <Markdown key={index} linkTarget="_blank">
              {log}
            </Markdown>
          ))}
          <br />
        </Paper>
      </Box>
    </Box>
  );
};

export default ResearchPanel;
