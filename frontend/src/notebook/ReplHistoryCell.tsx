import React, { ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { Output } from "../Notebook";
import {
  applyViewer,
  asString,
  outputToData,
  renderDisplayData,
  Traceback,
} from "../RenderTools";
import { NotebookCellEditor } from "./NotebookCellEditor/NotebookCellEditor";
import { Theme, Tooltip } from "@mui/material";
import { EditorType } from "../neptyne-sheet/SheetCodeEditor/sheetCodeEditorUtils";
import Convert from "ansi-to-html";
import { theme } from "../theme";

export type CellAction = "open_requirements";

export interface NotebookCellProp {
  source: string;
  outputs: Output[] | null;
  onAction: (action: CellAction) => void;
  isBusy: boolean;
  metadata: { [key: string]: any };
}

const getOutputStyle = (theme: Theme) => ({
  ...theme.typography.body1,
  color: theme.palette.grey[900],
  fontFamily: "source-code-pro, Menlo, Monaco, Consolas, 'Courier New',monospace",
  maxHeight: "480px",
  display: "flex",
});

class ReplHistoryCell extends React.PureComponent<NotebookCellProp> {
  checkForActions(input: string): ReactNode | null {
    if (input.trimLeft().startsWith("!pip install")) {
      return (
        <div style={{ textAlign: "right" }}>
          <Button
            size="small"
            variant="outlined"
            onClick={() => this.props.onAction("open_requirements")}
          >
            Add packages to requirements.txt
          </Button>
        </div>
      );
    }
    return null;
  }

  renderOutputs(outputs: Output[]) {
    const ansiConvert = new Convert({
      newline: true,
      fg: "black",
      bg: theme.palette.background.default,
      escapeXML: true,
    });

    return outputs.map((output, ix) => {
      if (output.output_type === "error") {
        return <Traceback key={ix} traceback={output.traceback} />;
      } else if (output.output_type === "stream") {
        const style = {
          display: "block",
          padding: "1px",
          ...(output.name === "stderr" ? { backgroundColor: "#fdd" } : {}),
        };
        try {
          const html = ansiConvert.toHtml(asString(output.text));
          return (
            <span key={ix} style={style} dangerouslySetInnerHTML={{ __html: html }} />
          );
        } catch (e) {
          console.log(e);
        }
        return (
          <span key={ix} style={style}>
            <pre style={{ whiteSpace: "pre-wrap", margin: 2 }}>
              {asString(output.text)}
            </pre>
          </span>
        );
      } else {
        const data = outputToData([output]);
        const { value, viewer } = renderDisplayData(data);
        if (!viewer && Object.keys(data).length === 0) {
          return null;
        }
        return <div key={ix}>{applyViewer(value, viewer)}</div>;
      }
    });
  }

  render() {
    const { source, outputs, isBusy, metadata } = this.props;
    const renderedOutput = outputs !== null && this.renderOutputs(outputs);

    const outputDiv =
      renderedOutput && renderedOutput.length > 0 ? (
        <Box sx={getOutputStyle}>
          <div
            className="outputArea"
            style={{ width: "100%", maxHeight: "480", overflow: "auto" }}
          >
            {renderedOutput}
          </div>
        </Box>
      ) : null;

    const extraPrompts = this.checkForActions(source);

    const dateStr = (metadata.date && new Date(metadata.date).toLocaleString()) || "";
    const durationStr = metadata.duration ? `${metadata.duration.toFixed(2)}s` : "";
    const isAIPrompt = metadata["ai_prompt"] !== undefined;

    return (
      <div
        style={{
          display: "block",
          position: "relative",
          border: "1px",
          borderColor: "lightgray",
          borderRadius: 5,
          borderStyle: "solid",
          margin: 3,
          padding: 2,
        }}
      >
        {source !== "" && (
          <div
            style={{
              border: 1,
              minHeight: 28,
            }}
          >
            <div
              style={{
                width: "100%",
                display: "block",
                overflow: "hidden",
              }}
            >
              <Box style={{ height: "100%" }}>
                <NotebookCellEditor
                  editorType={
                    isAIPrompt ? EditorType.replAIHistory : EditorType.replPython
                  }
                  value={asString(source)}
                  readOnly
                  isBusy={isBusy}
                />
              </Box>
            </div>
          </div>
        )}
        {outputDiv}
        {extraPrompts}
        {source !== "" && (
          <div
            style={{
              position: "absolute",
              right: 4,
              top: 2,
              fontFamily: "monospace",
            }}
          >
            <Tooltip title={dateStr}>
              <div style={{ fontSize: "0.65rem" }}>{durationStr}</div>
            </Tooltip>
          </div>
        )}
      </div>
    );
  }
}

export default ReplHistoryCell;
