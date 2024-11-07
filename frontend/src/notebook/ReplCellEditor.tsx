import { forwardRef, useMemo } from "react";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { BaseCodeEditorProps } from "../codemirror-editor/BaseCodeEditor/BaseCodeEditor";
import { AutocompleteHandler } from "./NotebookCellEditor/types";
import { EditorView } from "@codemirror/view";
import { sheetOnlyHotKeys } from "../hotkeyConstants";
import { CodeMirrorApi } from "../codemirror-editor/CodeMirror";
import { CellIdPicker } from "../cell-id-picking/CellIdPicker";
import {
  EditorType,
  getSheetLanguageExtensions,
} from "../neptyne-sheet/SheetCodeEditor/sheetCodeEditorUtils";
import { mobileFontExtensions } from "../codemirror-editor/extensions/mobile-fonts";
import { isMobile } from "react-device-detect";
import Stack from "@mui/material/Stack";
import {
  Box,
  FormControl,
  MenuItem,
  Tooltip,
  Select,
  SelectChangeEvent,
} from "@mui/material";

import TerminalIcon from "@mui/icons-material/Terminal";
const CODE_PLACEHOLDER_TEXT = "Run code here to test it";
const AI_PLACEHOLDER_TEXT = "Enter an AI prompt to generate code";

export interface ReplEditorProps extends BaseCodeEditorProps {
  getAutocomplete?: AutocompleteHandler;
  showPlaceholder: boolean;
  promptMode: "python" | "ai";
  togglePromptMode: () => void;
}

export const ReplCellEditor = forwardRef<CodeMirrorApi, ReplEditorProps>(
  (
    {
      getAutocomplete,
      showPlaceholder,
      readOnly,
      promptMode,
      togglePromptMode,
      ...props
    },
    ref
  ) => {
    const value = props.value || "";
    const extensions = useMemo(
      () => [
        ...getSheetLanguageExtensions(
          value.toString(),
          getAutocomplete,
          promptMode === "ai" ? EditorType.replAI : EditorType.replPython
        ),
        EditorView.theme({
          "&.cm-editor": {
            backgroundColor: readOnly ? "#f5f5f5" : "#f3f9ff",
            border: "1px solid #e1e4e8",
          },
        }),
        ...(isMobile ? mobileFontExtensions : []),
      ],
      [getAutocomplete, promptMode, readOnly, value]
    );

    const icon = promptMode === "python" ? <AutoAwesomeIcon /> : <TerminalIcon />;

    const tooltipText =
      promptMode === "python"
        ? "Click to change to AI mode"
        : "Click to change to Python mode";

    const handleSelectChange = (event: SelectChangeEvent<"python" | "ai">) => {
      const mode = event.target.value as string;
      if (promptMode !== mode) {
        togglePromptMode();
      }
    };

    const gutter = (
      <FormControl
        variant="outlined"
        size="small"
        sx={{ "&": { transform: "translateX(-1px)" } }}
      >
        <Select
          value={promptMode}
          onChange={handleSelectChange}
          displayEmpty
          sx={{
            color: "#26BFAD",
            fontSize: "12px",
            "& .MuiSelect-icon": {
              top: "50%",
              transform: "translateX(-15px) translateY(-15px)",
            },
            "& .MuiOutlinedInput-notchedOutline": {
              border: "none",
            },
            "& .MuiSelect-select": {
              paddingRight: "5px !important",
              // paddingLeft: "5px !important",
            },
          }}
          renderValue={(selected) => (
            <span style={{ paddingLeft: "2px" }}>
              {" "}
              {selected === "ai" ? <AutoAwesomeIcon /> : <TerminalIcon />}
            </span>
          )}
        >
          <MenuItem value="python">
            <TerminalIcon />
            <span style={{ marginLeft: 8, fontSize: "12px" }}>Python Mode</span>
          </MenuItem>
          <MenuItem value="ai">
            <AutoAwesomeIcon />
            <span style={{ marginLeft: 8, fontSize: "12px" }}>AI Mode</span>
          </MenuItem>
        </Select>
      </FormControl>
    );
    const placeholder =
      promptMode === "ai" ? AI_PLACEHOLDER_TEXT : CODE_PLACEHOLDER_TEXT;

    return (
      <Stack direction="row" display="flex">
        <Box
          height="30px"
          borderTop="1px solid"
          borderColor="lightgrey"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          {gutter}
        </Box>
        <Box height="100%" overflow="auto" flexGrow={1}>
          <CellIdPicker
            ref={ref}
            extensions={extensions}
            mutedHotKeys={sheetOnlyHotKeys}
            testId="repl-editor"
            readOnly={readOnly}
            placeholder={
              showPlaceholder || promptMode === "ai" ? placeholder : undefined
            }
            {...props}
          />
        </Box>
      </Stack>
    );
  }
);
