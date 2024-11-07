import * as React from "react";
import { useEffect, useState } from "react";
import ReplHistoryCell, { CellAction } from "./ReplHistoryCell";
import { CodeCell, Error, Output } from "../Notebook";
import Stack from "@mui/material/Stack";
import { AutocompleteHandler } from "./NotebookCellEditor/types";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Tooltip from "@mui/material/Tooltip";
import { asString, ErrorToolTip, Traceback } from "../RenderTools";
import { ReplCellEditor } from "./ReplCellEditor";
import { DragResizeHandler } from "../components/HeaderResizeHandler/DragResizeHandler";
import { Dimension, SheetData, TracebackFrame, TyneEvent } from "../NeptyneProtocol";
import { NotebookCellEditor } from "./NotebookCellEditor/NotebookCellEditor";
import _ from "lodash";
import ErrorIcon from "@mui/icons-material/Error";
import PendingIcon from "@mui/icons-material/Pending";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { Decoration, EditorView, KeyBinding, ViewUpdate } from "@codemirror/view";
import { getIndentation } from "@codemirror/language";
import { EditorSelection, EditorState, EditorStateConfig } from "@codemirror/state";
import { defaultKeymap } from "@codemirror/commands";
import { openSearchPanel, search, searchKeymap } from "@codemirror/search";
import { multilineTabIndent } from "../codemirror-editor/BaseCodeEditor/multiline-tab-indent";
import { createRoot } from "react-dom/client";
import { EditorType } from "../neptyne-sheet/SheetCodeEditor/sheetCodeEditorUtils";
import IconButton from "@mui/material/IconButton";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import { ButtonProps } from "@mui/material/Button";
import { isMobile } from "react-device-detect";
import { mobileFontExtensions } from "../codemirror-editor/extensions/mobile-fonts";
import { CodeMirrorApi, removeUnderline } from "../codemirror-editor/CodeMirror";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import GSheetSpeedMenu from "./GSheetSpeedMenu";
import { Diagnostic } from "@codemirror/lint";
import GSHeetFunctionHint, {
  getExampleCode,
  topLevelFunctions,
} from "./GSheetFunctionHint";
import { ThemeProvider } from "@emotion/react";
import { theme } from "../theme";
import { Backdrop, CircularProgress } from "@mui/material";
import {
  getGSheetAppConfig,
  setGSheetFunctionHintsHiddenLevel,
} from "../gsheet_app_config";
import { LaunchButtonWidget } from "../codemirror-editor/BaseCodeEditor/streamlit-decorator";
import { showStreamlit } from "../neptyne-container/appsScript";
import { flushSync } from "react-dom";
import { useUserInfo } from "../user-context";

const mobileOnlyExtensions = isMobile ? mobileFontExtensions : [];

export interface ReplEditorValue {
  value: string;
  editorSelection: EditorStateConfig["selection"];
}

interface TracebackOutput extends Error {
  output_type: "error";
  metadata: {
    traceback_type: "neptyne" | "linter";
    traceback: TracebackFrame[];
  };
}

export interface NBCell extends CodeCell {
  cell_id: string;
  source: string;
  outputs: (Output | TracebackOutput)[];
  executionTime?: number;
  date?: string;
}

export const CODE_PANEL_CELL_ID = "00";

export type EditorRange = { from: number; to: number };

export type Severity = "hint" | "info" | "warning" | "error";

export const isNBCell = (cell?: TyneEvent | NBCell): cell is NBCell => {
  if (cell === undefined) {
    return false;
  }
  return "cell_type" in cell;
};

export interface NotebookProps {
  cells: {
    [cellId: string]: NBCell;
  };
  codePanelCell: NBCell;
  readOnly: boolean;
  codeCellChanged: (source: string) => void;
  onHighlightChange: (highlight: EditorRange[]) => void;
  runCodeCell: () => void;
  scrollY: number;
  onNotebookScrolled: (toY: number) => void;
  getAutocomplete: AutocompleteHandler;
  codeEditorWidth: number;
  runRepl: (code: string, forAI: boolean) => void;
  handleCellAction: (action: CellAction) => void;
  replCellRef: React.RefObject<CodeMirrorApi>;
  notebookRef: React.RefObject<CodeMirrorApi>;
  hideRepl: boolean;
  highlight?: EditorRange[];
  events: TyneEvent[];
  popOutEditor?: () => void;
  thinking: (msg: string | null) => void;
  errorBar?: string;
  hasStreamlit: boolean;
  displaySnackbar: (msg: string) => void;
  connectToKernel: (name: string) => void;
}

const gsheetPlaceHolderText = `Define your functions here.
Code is automatically evaluated.
You can also add imports here.
Execute code from the sheet
with:
  =PY("funcname", args)
where funcname is the name of
your function and args can refer
to something in the spreadsheet
like A1 or A1:A4, B3 etc`;

const defaultPlaceholderText = `Code here is executed every time you
change it. Put your imports and
function here. Use the command line
interface below (REPL) to interact
with your code and sheet`;

const placeholderText = getGSheetAppConfig().inGSMode
  ? gsheetPlaceHolderText
  : defaultPlaceholderText;

const isClearOutput = (output: Output) => {
  return output.output_type === "stream" && output.text === "\x1B[H\x1B[2J";
};

const getCodeStatusIcon = (
  isDirty: boolean,
  codePanelCell: NBCell,
  tracebackComponent: JSX.Element | null
): JSX.Element | null => {
  if (isDirty) {
    // don't show any icon
    return null;
  } else if (tracebackComponent !== null) {
    return (
      <ErrorToolTip title={tracebackComponent}>
        <ErrorIcon sx={{ color: "error.main", opacity: "75%" }} />
      </ErrorToolTip>
    );
  } else if (codePanelCell.execution_count === null) {
    return <PendingIcon sx={{ color: "grey.400", opacity: "75%" }} />;
  } else {
    const suffix =
      codePanelCell.executionTime !== undefined
        ? `in ${codePanelCell.executionTime}s`
        : "successfully";
    return (
      <Tooltip title={`Ran ${suffix}`}>
        <CheckCircleIcon
          sx={(theme) => ({ color: theme.palette.secondary.main, opacity: "75%" })}
        />
      </Tooltip>
    );
  }
};

const getErrorDetails = (outputs: (Output | TracebackOutput)[]) => {
  let errorLines: [Severity, number, string][] = [];
  let traceback: string[] = [];
  if (outputs.length > 0) {
    outputs.forEach((output) => {
      if (output.output_type === "error") {
        if ("metadata" in output && "traceback" in output.metadata) {
          output.metadata.traceback
            .filter((tb) => tb.current_cell)
            .forEach(({ lineno, line }) => {
              errorLines.push([
                output.metadata.traceback_type === "neptyne" ? "error" : "warning",
                lineno,
                line,
              ]);
            });
        } else {
          traceback = output.traceback;
        }
      }
    });
  }
  return {
    // TODO: our linter sometimes returns many duplicates. Why is that? It seems that
    // the ast_parse method in ipython is invoked multiple times, which is where we
    // fire the linter.
    errorLines: _.uniqWith(errorLines, _.isEqual),
    traceback,
  };
};

const NOTEBOOK_WRAPPER_STYLES: React.CSSProperties = {
  height: "100%",
  position: "relative",
};

const SubmitButton = (props: ButtonProps) => {
  return (
    <IconButton aria-label="submit" color="primary" sx={{ padding: "2px" }} {...props}>
      <PlayCircleIcon />
    </IconButton>
  );
};

function findStreamlitDecorator(source: string): number {
  const lines = source.split("\n");
  let charCount = 0;
  for (const line of lines) {
    if (/^@\s*(nt.|neptyne.)?\s*streamlit/.test(line)) {
      return charCount;
    }
    charCount += line.length + 1;
  }
  return -1;
}

export function aiSubmit(
  prompt: string,
  thinking: (msg: string | null) => void,
  authFetch: (url: string, options: RequestInit) => Promise<Response>,
  onInsertSnippet: (msg: string, code: string) => void,
  sheetData: SheetData | null
) {
  thinking("Generating code snippet");
  authFetch("/api/ai_snippet", {
    method: "POST",
    body: JSON.stringify({ prompt, sheetData }),
  })
    .then((response) => response.text())
    .then((payload: string) => {
      const { msg, code } = JSON.parse(payload);
      onInsertSnippet(msg, code);
    })
    .catch((err) => {
      console.error(err);
    })
    .finally(() => {
      thinking(null);
    });
}

const NeptyneNotebook: React.FunctionComponent<NotebookProps> = ({
  cells,
  codePanelCell,
  readOnly,
  getAutocomplete,
  popOutEditor,
  runRepl,
  handleCellAction,
  scrollY,
  codeCellChanged,
  runCodeCell,
  onNotebookScrolled,
  replCellRef,
  hideRepl,
  notebookRef,
  highlight,
  onHighlightChange,
  events,
  thinking,
  errorBar,
  hasStreamlit,
  displaySnackbar,
  connectToKernel,
}) => {
  const scrollDivRef = React.useRef<HTMLDivElement>(null);
  const replRef = React.useRef<HTMLDivElement>(null);
  const replScrollRef = React.useRef<HTMLDivElement>(null);

  const [replHeight, setReplHeight] = React.useState(200);

  React.useEffect(() => {
    if (isMobile) {
      const eventListener = () => setReplHeight(window.innerHeight / 2);

      window.screen.orientation.addEventListener("change", eventListener);
      return () =>
        window.screen.orientation.removeEventListener("change", eventListener);
    }
  }, []);

  const [isDirty, setIsDirty] = React.useState(false);
  const isDirtyRef = React.useRef(isDirty);
  React.useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  const { gsheetFunctionHintsHiddenLevel, inGSMode } = getGSheetAppConfig();
  const [didHideGsheetHints, setDidHideGsheetHints] = React.useState(
    gsheetFunctionHintsHiddenLevel === "all"
  );
  const [didDismissInitialHint, setDidDismissInitialHint] = React.useState(
    gsheetFunctionHintsHiddenLevel === "all" || gsheetFunctionHintsHiddenLevel === "nux"
  );
  const [gSheetFunctionHintPosition, setGSheetFunctionHintPosition] = React.useState<
    [number, number, string] | null
  >(null);
  const [loadingStreamlit, setLoadingStreamlit] = React.useState(false);

  const value = codePanelCell.source;
  const [didEditCodePanel, setDidEditCodePanel] = React.useState(false);

  const maybeShowHint = React.useCallback(() => {
    if (!didDismissInitialHint && notebookRef.current) {
      const view = notebookRef.current.getView();
      if (view) {
        const node = topLevelFunctions(view.state).next().value;
        if (node !== null) {
          const rect = view.coordsAtPos(node.from);
          const exampleCode = getExampleCode(node, view.state);
          if (rect !== null) {
            const { top, left } = rect;
            setGSheetFunctionHintPosition([top + 20, left + 10, exampleCode]);
          }
        }
      }
    }
  }, [didDismissInitialHint, notebookRef]);

  const handleRunCodeCell = React.useCallback(
    (e: FocusEvent | undefined = undefined) => {
      if (
        e &&
        e.relatedTarget &&
        document.getElementById("code-pane")?.contains(e.relatedTarget as HTMLElement)
      ) {
        return;
      }
      if (isDirty) {
        runCodeCell();
        setIsDirty(false);
        onHighlightChange([]);
        maybeShowHint();
      }
    },
    [runCodeCell, onHighlightChange, isDirty, maybeShowHint]
  );

  const codexOutputRange = React.useRef<EditorRange[]>();

  const extraKeyBindings: KeyBinding[] = React.useMemo(
    () => [
      {
        key: "Escape",
        run: (view) => {
          if (codexOutputRange.current) {
            view.dispatch({
              changes: codexOutputRange.current.map((highlightSegment) => ({
                ...highlightSegment,
                insert: "",
              })),
            });
            codexOutputRange.current = [];
            onHighlightChange([]);
            return false;
          }
          return true;
        },
      },
      {
        key: "Tab",
        run: (view: EditorView) => {
          if (codexOutputRange.current) {
            view.dispatch({
              effects: [removeUnderline.of({})],
            });
            codexOutputRange.current = [];
            onHighlightChange([]);
            return true;
          }
          return false;
        },
      },
      ...searchKeymap
        // an ugly way to avoid conflict between blur event that submits data and focus event on
        // opening of a search pane.
        .filter(({ key }) => key !== "Mod-f")
        .concat([
          {
            key: "Mod-f",
            run: (view) => {
              replRef.current?.blur();
              handleRunCodeCell();
              setTimeout(() => openSearchPanel(view), 10);
              return true;
            },
            scope: "editor search-panel",
          },
        ]),
    ],
    [onHighlightChange, handleRunCodeCell]
  );

  const { fetch: authFetch } = useUserInfo();

  const handleCodeCellChanged = React.useCallback(
    (source: string, isUserEvent: boolean) => {
      codeCellChanged(source);
      setDidEditCodePanel(true);
      if (isUserEvent) {
        setIsDirty(true);
        codexOutputRange.current = undefined;
        onHighlightChange([]);
      }
    },
    [codeCellChanged, onHighlightChange]
  );

  if (scrollDivRef.current) {
    scrollDivRef.current.scrollTop = scrollY;
  }

  const entries: (NBCell | TyneEvent)[] = React.useMemo(
    () =>
      [...Object.values(cells), ...events]
        .filter((cellOrEvent) => cellOrEvent !== undefined)
        .sort((a, b) => {
          const aKey = entrySortKey(a);
          const bKey = entrySortKey(b);
          return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
        }),
    [cells, events]
  );

  const lastClearedIx = _.findLastIndex(entries, (cell) => {
    return (
      isNBCell(cell) && cell.cell_type === "code" && _.some(cell.outputs, isClearOutput)
    );
  });

  const renderEntries = React.useMemo(
    () => (lastClearedIx === -1 ? entries : entries.slice(lastClearedIx + 1)),
    [entries, lastClearedIx]
  );

  React.useEffect(() => {
    // ReplHistoryCell renders with a slight delay, so we have to wait a bit to catch
    // the real REPL height and apply scroll
    const timer = setTimeout(() => {
      const { current: replScroll } = replScrollRef;
      if (replScroll) {
        replScroll.scrollTop = replScroll.scrollHeight;
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [renderEntries]);

  const { errorLines, traceback } = React.useMemo(
    () => getErrorDetails(codePanelCell.outputs),
    [codePanelCell.outputs]
  );

  const tracebackComponent = React.useMemo(
    () => (traceback.length > 0 ? <Traceback traceback={traceback} /> : null),
    [traceback]
  );

  const tracebackComponentRef = React.useRef(tracebackComponent);
  React.useEffect(() => {
    tracebackComponentRef.current = tracebackComponent;
  }, [tracebackComponent]);

  const errorLinesRef = React.useRef(errorLines);
  React.useEffect(() => {
    errorLinesRef.current = errorLines;
  }, [errorLines]);

  const codeStatusIcon = getCodeStatusIcon(isDirty, codePanelCell, tracebackComponent);

  const popoutIcon = popOutEditor && (
    <Tooltip title="Open editor in its own window">
      <IconButton onClick={popOutEditor}>
        <OpenInNewIcon sx={{ color: "grey.600", opacity: "75%" }} />
      </IconButton>
    </Tooltip>
  );

  const handleScroll = React.useCallback(
    (e: React.UIEvent<HTMLElement>) => {
      onNotebookScrolled(e.currentTarget.scrollTop);
    },
    [onNotebookScrolled]
  );

  useEffect(() => {
    const handleUnLoad = () => {
      runCodeCell();
    };

    window.addEventListener("beforeunload", handleUnLoad);

    return () => {
      window.removeEventListener("beforeunload", handleUnLoad);
    };
  }, [runCodeCell]);

  const disableGSheetLintHints = React.useCallback(() => {
    setGSheetFunctionHintsHiddenLevel("all");
    setDidHideGsheetHints(true);
    google.script.run.hideGSheetFunctionHints("all");
  }, []);

  const handleLintSource = React.useCallback(
    (view: EditorView) => {
      if (isDirtyRef.current) {
        return [];
      }

      const diagnostics: Diagnostic[] = [];
      if (inGSMode && !didHideGsheetHints) {
        for (const node of topLevelFunctions(view.state)) {
          const code = getExampleCode(node, view.state);
          diagnostics.push({
            from: node.from,
            to: node.node.nextSibling?.to,
            severity: "hint",
            message: "",
            renderMessage: () => {
              const elem = document.createElement("div");
              createRoot(elem).render(
                <ThemeProvider theme={theme}>
                  <GSHeetFunctionHint
                    code={code}
                    onDisableHint={disableGSheetLintHints}
                  />
                </ThemeProvider>
              );
              return elem;
            },
          });
        }
      }

      if (!errorLinesRef.current || errorLinesRef.current.length === 0) {
        return diagnostics;
      }
      return diagnostics.concat(
        errorLinesRef.current.map(([severity, lineNumber, line]) => {
          const { from, to, text } = view.state.doc.line(lineNumber);
          return {
            from: from + text.search(/\S/),
            to,
            message: "",
            severity: severity,
            renderMessage: () => {
              const elem = document.createElement("div");
              createRoot(elem).render(
                severity === "error" && tracebackComponentRef.current !== null ? (
                  tracebackComponentRef.current
                ) : (
                  <Traceback traceback={[line]} />
                )
              );
              return elem;
            },
          };
        })
      );
    },
    [errorLines, didHideGsheetHints] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleClickStreamlit = React.useCallback(() => {
    if (inGSMode) {
      setLoadingStreamlit(true);
      showStreamlit().finally(() => setLoadingStreamlit(false));
    }
  }, [inGSMode]);

  const extensions = React.useMemo(() => {
    const exts = [search(), ...mobileOnlyExtensions];

    if (hasStreamlit && inGSMode) {
      const index = findStreamlitDecorator(value);
      if (index === -1) {
        return exts;
      }
      const decorationSet = EditorView.decorations.of(
        Decoration.set([
          Decoration.widget({
            widget: new LaunchButtonWidget(handleClickStreamlit),
            side: 0,
            block: true,
          }).range(index),
        ])
      );

      return [decorationSet, ...exts];
    }

    return exts;
  }, [hasStreamlit, inGSMode, value, handleClickStreamlit]);

  const handleClick = React.useCallback(
    () => onHighlightChange([]),
    [onHighlightChange]
  );

  const replHistory = React.useMemo(
    () => Object.values(cells).map((cell) => asString(cell.source)),
    [cells]
  );

  const handleInsertSnippet = React.useCallback(
    (msg: string, code: string) => {
      if (value.length > 0) {
        code = value + "\n\n" + code;
        onHighlightChange([{ from: value.length, to: code.length }]);
      }
      flushSync(() => {
        codeCellChanged(code);
      });
      runCodeCell();
      maybeShowHint();
      if (msg) {
        displaySnackbar(msg);
      }
    },
    [
      codeCellChanged,
      maybeShowHint,
      onHighlightChange,
      runCodeCell,
      value,
      displaySnackbar,
    ]
  );

  const handleReplSubmit = React.useCallback(
    (code: string, forAI: boolean, sheetData: SheetData | null) => {
      code = stripLeadingEquals(code);
      if (forAI && authFetch) {
        aiSubmit(code, thinking, authFetch, handleInsertSnippet, sheetData);
      } else {
        runRepl(code, forAI);
      }
    },
    [runRepl, thinking, authFetch, handleInsertSnippet]
  );

  const showSpeedDial = inGSMode;

  return (
    <Stack
      id="notebook"
      overflow="hidden"
      flexGrow={1}
      height="100%"
      // maxWidth={codeEditorWidth}
      width="100%"
      ref={scrollDivRef}
      onScroll={handleScroll}
      sx={{ backgroundColor: "background.default" }}
    >
      <Backdrop
        sx={{ color: "#fff", zIndex: (theme) => theme.zIndex.drawer + 1 }}
        open={loadingStreamlit}
      >
        <CircularProgress color="inherit" />
      </Backdrop>
      <Backdrop
        open={inGSMode && !!gSheetFunctionHintPosition && !didDismissInitialHint}
        sx={{
          zIndex: 1051,
        }}
      >
        <Box
          position={"absolute"}
          top={gSheetFunctionHintPosition?.[0]}
          left={gSheetFunctionHintPosition?.[1]}
          sx={{
            backgroundColor: "background.paper",
            padding: "8px",
            borderRadius: "4px",
          }}
        >
          <GSHeetFunctionHint
            code={gSheetFunctionHintPosition?.[2] || ""}
            onDismissHint={() => {
              setGSheetFunctionHintsHiddenLevel("nux");
              setDidDismissInitialHint(true);
              google.script.run.hideGSheetFunctionHints("nux");
            }}
          />
        </Box>
      </Backdrop>
      {errorBar && <Box sx={{ backgroundColor: "error.light" }}>{errorBar}</Box>}
      {showSpeedDial && (
        <GSheetSpeedMenu
          openNewWindow={popOutEditor}
          codeStatusIcon={codeStatusIcon}
          thinking={thinking}
          onInsertSnippet={handleInsertSnippet}
          emptyCodePanel={value === "" && !readOnly && !didEditCodePanel}
          connectToKernel={connectToKernel}
        />
      )}

      <Box flexGrow={1} overflow="auto" id="code-editor" display="flex">
        {!showSpeedDial && (
          <Stack position="absolute" right={0} top={4} zIndex={2}>
            {popOutEditor && !inGSMode && <Box>{popoutIcon}</Box>}
            <Box sx={{ textAlign: "right", marginRight: "8px", marginTop: "2px" }}>
              {codeStatusIcon}
            </Box>
          </Stack>
        )}
        <div
          style={{
            display: "flex",
            position: "relative",
            width: "100%",
          }}
        >
          <div
            style={{
              border: 1,
              minHeight: 28,
              width: "100%",
              display: "block",
              overflow: "hidden",
            }}
          >
            <Box
              style={NOTEBOOK_WRAPPER_STYLES}
              data-testid="notebook-wrapper"
              id="code-pane"
            >
              <NotebookCellEditor
                withClosedBrackets
                onClick={handleClick}
                ref={notebookRef}
                getAutocomplete={getAutocomplete}
                editorType={EditorType.codepane}
                value={value}
                onChanges={handleCodeCellChanged}
                extraKeyBindings={extraKeyBindings}
                onBlur={handleRunCodeCell}
                readOnly={readOnly}
                lintSource={handleLintSource}
                highlightSelection={highlight}
                extensions={extensions}
                fullHeight
                showLineNumbers
                placeholder={placeholderText}
              />
            </Box>
          </div>
        </div>
      </Box>
      {!hideRepl && (
        <>
          <DragResizeHandler
            dimension={Dimension.Row}
            onResizing={setReplHeight}
            parentRef={replRef}
            minSize={50}
            className={"repl-resize-bar"}
            invert
          >
            <Box>
              <Divider orientation={"horizontal"} flexItem sx={{ height: 1 }} />
            </Box>
          </DragResizeHandler>
          <Box
            style={{
              verticalAlign: "bottom",
              width: "100%",
            }}
          >
            <Stack>
              <Box
                ref={replRef}
                height={replHeight}
                display="flex"
                flexDirection="column"
              >
                <Stack
                  overflow="auto"
                  justifyContent="flex-end"
                  display="block"
                  ref={replScrollRef}
                >
                  <>
                    {renderEntries.map((cell, idx) => {
                      if (isNBCell(cell)) {
                        const cellSource = asString(cell.source);
                        const isEmpty = cellSource.trim().length === 0;
                        return (
                          <ReplHistoryCell
                            key={`entry_${idx}`}
                            source={cellSource}
                            outputs={cell.cell_type === "code" ? cell.outputs : null}
                            onAction={handleCellAction}
                            isBusy={
                              (!cell.execution_count || cell.execution_count < 0) &&
                              !isEmpty &&
                              cell.executionTime === undefined
                            }
                            metadata={cell.metadata}
                          />
                        );
                      } else {
                        return <EventLogEntry key={`entry_${idx}`} {...cell} />;
                      }
                    })}
                  </>
                </Stack>
              </Box>
              <ReplCell
                ref={replCellRef}
                getAutocomplete={getAutocomplete}
                history={replHistory}
                onSubmit={handleReplSubmit}
                readOnly={readOnly}
                showPlaceholder={renderEntries.length === 0}
              />
            </Stack>
          </Box>
        </>
      )}
    </Stack>
  );
};

const entrySortKey = (entry: TyneEvent | NBCell) => {
  if (isNBCell(entry)) {
    return entry.metadata.date ?? entry.metadata.clientDate ?? "0000-01-01T00:00:00Z";
  } else {
    return entry.date;
  }
};

export const getCodeCellDict = (cellId: string): NBCell => {
  return {
    cell_id: cellId,
    cell_type: "code",
    source: "",
    metadata: {},
    execution_count: 0,
    outputs: [],
  };
};

interface ReplCellProps {
  getAutocomplete: AutocompleteHandler;
  history: string[];
  onSubmit: (code: string, forAI: boolean, sheetData: SheetData | null) => void;
  readOnly: boolean;
  showPlaceholder: boolean;
}

const REPL_WRAPPER_FLEX_STYLE = {
  border: 1,
  display: "flex",
  height: "100%",
};

const REPL_WRAPPER_BLOCK_STYLE = {
  width: "100%",
  display: "block",
  overflow: "hidden",
};

const useValueWithHistory = (
  history: string[],
  replValue: ReplEditorValue,
  onReplUpdate: (update: ViewUpdate) => void
) => {
  const [historyPos, setHistoryPos] = React.useState<number | null>(null);
  const editedHistory = React.useRef<{ [pos: number]: string }>({});

  const [editorValue, setEditorValue] = React.useState<ReplEditorValue>({
    value: "",
    editorSelection: EditorSelection.single(0),
  });

  React.useEffect(() => {
    setEditorValue(replValue);
    if (historyPos !== null && replValue.value) {
      editedHistory.current = {
        ...editedHistory.current,
        [historyPos]: replValue.value,
      };
    }
    // we want to update editedHistory only when replValue changes.
    // historyPos change is handled in other way
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replValue]);

  const onUpdate = React.useCallback(
    (viewUpdate: ViewUpdate) => {
      const updateObj: Partial<ReplEditorValue> = {};
      if (viewUpdate.selectionSet) {
        updateObj.editorSelection = viewUpdate.state.selection;
      }
      if (viewUpdate.docChanged) {
        updateObj.value = viewUpdate.state.doc.toString();
      }
      if (Object.keys(updateObj).length) {
        setEditorValue((value) => ({ ...value, ...updateObj }));
      }
      if (historyPos !== null && updateObj.value) {
        editedHistory.current = {
          ...editedHistory.current,
          [historyPos]: updateObj.value,
        };
      }
      onReplUpdate(viewUpdate);
    },
    [historyPos, onReplUpdate]
  );

  const onEnter = React.useCallback(() => {
    editedHistory.current = {};
    setHistoryPos(null);
    setEditorValue((editorValue) => ({ ...editorValue, value: "" }));
  }, []);

  const onDownArrow = React.useCallback(() => {
    const newCursorPos = moveThroughHistory(historyPos, history, 1);
    const newValue =
      getValueFromHistory(newCursorPos, editedHistory.current, history) || "";
    setHistoryPos(newCursorPos);
    setEditorValue({
      value: newValue,
      editorSelection: EditorSelection.single(newValue.length),
    });
  }, [history, historyPos]);

  const onUpArrow = React.useCallback(() => {
    // 1-indexed, presumably to render line numbers
    const newCursorPos = moveThroughHistory(historyPos, history, -1);
    const newValue =
      getValueFromHistory(newCursorPos, editedHistory.current, history) || "";
    setHistoryPos(newCursorPos);
    setEditorValue({
      value: newValue,
      editorSelection: EditorSelection.single(newValue.length),
    });
  }, [history, historyPos]);

  return {
    onUpdate,
    onEnter,
    onDownArrow,
    onUpArrow,
    value: editorValue.value,
    editorSelection: editorValue.editorSelection,
  };
};

const getValueFromHistory = (
  historyPos: number | null,
  editedHistory: { [pos: number]: string },
  history: string[]
): string | null => {
  if (historyPos !== null) {
    return editedHistory[historyPos] === undefined
      ? history[historyPos]
      : editedHistory[historyPos];
  }
  return null;
};

const moveThroughHistory = (
  pos: number | null,
  history: string[],
  direction: number
) => {
  if (pos == null) {
    pos = history.length;
  }
  let nextPos = pos;
  while (true) {
    nextPos = nextPos + direction;
    if (nextPos < 0) {
      return pos;
    } else if (nextPos >= history.length) {
      return null;
    }
    if (history[nextPos] && history[nextPos].trim() !== history[pos]?.trim()) {
      return nextPos;
    }
  }
};

const EventLogEntry = (props: TyneEvent) => {
  const { message, severity } = props;

  const backgroundColor = severity === "ERROR" ? "rgb(253, 237, 237)" : "lightyellow";

  return <div style={{ backgroundColor, padding: 4 }}>{message}</div>;
};

const stripLeadingEquals = (code: string) => {
  return code.replace(/^\s*=/, "");
};

const ReplCell = React.forwardRef<CodeMirrorApi, ReplCellProps>(
  (
    { getAutocomplete, history, onSubmit, readOnly, showPlaceholder }: ReplCellProps,
    ref
  ) => {
    const [sheetData, setSheetData] = useState<SheetData | null>(null);
    const [userPromptMode, setUserPromptMode] = React.useState<
      "python" | "ai" | undefined
    >(undefined);
    const [didFreezePromptType, setDidFreezePromptType] = React.useState(false);

    const replEditorValue = React.useMemo(
      () => ({
        value: "",
        editorSelection: EditorSelection.single(0),
      }),
      []
    );
    const handleSubmit = React.useCallback(
      (code: string, forAI: boolean) => {
        onSubmit(code, forAI, sheetData);
        setUserPromptMode(undefined);
      },
      [onSubmit, sheetData]
    );

    const togglePromptMode = React.useCallback(() => {
      setDidFreezePromptType(false);
      const newMode = userPromptMode === "ai" ? "python" : "ai";
      setUserPromptMode(newMode);
      if (newMode == "ai") {
        google.script.run
          .withSuccessHandler((result: any) => {
            console.log("Got sheet data");
            setSheetData(result);
          })
          .getSheetData();
      }
    }, [userPromptMode]);

    const handleValueChange = React.useCallback(() => {}, []);

    const { onUpdate, onDownArrow, onUpArrow, onEnter, value, editorSelection } =
      useValueWithHistory(history, replEditorValue, handleValueChange);

    const aiPrompt = userPromptMode === "ai";

    if (
      value.split(/\s+/).length > 3 &&
      !didFreezePromptType &&
      userPromptMode === undefined
    ) {
      setDidFreezePromptType(true);
      setUserPromptMode(aiPrompt ? "ai" : "python");
    } else if (value.length === 0 && didFreezePromptType) {
      setDidFreezePromptType(false);
      setUserPromptMode(undefined);
    }

    const keyBindings: KeyBinding[] = React.useMemo(
      () => [
        {
          key: "Enter",
          run: (view) => {
            // emulate shell behaviour and submit single line on Enter even if cursor is not at EOL
            if (view.state.doc.lines === 1) {
              view.dispatch(
                view.state.update({
                  selection: EditorSelection.single(view.state.doc.toString().length),
                })
              );
            }

            const { isEnd, indentation } = getLinePos(view.state);
            if (isEnd && !indentation && !readOnly) {
              handleSubmit(view.state.doc.toString(), aiPrompt);
              onEnter();
              return true;
            }
            return false;
          },
        },
        {
          key: "ArrowUp",
          run: (view) => {
            const { isFirst } = getLinePos(view.state);
            if (isFirst) {
              onUpArrow();
              return true;
            }
            return false;
          },
        },
        {
          key: "ArrowDown",
          run: (view) => {
            const { isLast } = getLinePos(view.state);
            if (isLast) {
              onDownArrow();
              return true;
            } else {
              return false;
            }
          },
        },
        multilineTabIndent,
        ...defaultKeymap,
      ],
      [aiPrompt, onDownArrow, onEnter, handleSubmit, onUpArrow, readOnly]
    );

    return (
      <Stack direction="row">
        <Box flexGrow={1} flexShrink={1} flexBasis="auto" width={0}>
          <div style={REPL_WRAPPER_FLEX_STYLE}>
            <div style={REPL_WRAPPER_BLOCK_STYLE}>
              <ReplCellEditor
                withClosedBrackets
                ref={ref}
                getAutocomplete={getAutocomplete}
                fullHeight={false}
                readOnly={readOnly}
                onUpdate={onUpdate}
                selection={editorSelection}
                extraKeyBindings={keyBindings}
                value={value}
                showPlaceholder={showPlaceholder}
                elementProps={REPL_ELEMENT_PROPS}
                promptMode={aiPrompt ? "ai" : "python"}
                togglePromptMode={togglePromptMode}
              />
            </div>
          </div>
        </Box>
        {isMobile && (
          <Box width="30px">
            <Box position="absolute" bottom="0px">
              <SubmitButton
                onClick={() => {
                  handleSubmit(value, aiPrompt);
                  onEnter();
                }}
              />
            </Box>
          </Box>
        )}
      </Stack>
    );
  }
);

const REPL_ELEMENT_PROPS = { id: "repl-editor" };

const getLinePos = (state: EditorState) => {
  const doc = state.doc;
  const from = state.selection.main.from;
  const no = doc.lineAt(from).number;
  return {
    isFirst: no === 1,
    isLast: no === doc.lines,
    isEnd: from === doc.length,
    indentation: getIndentation(state, from),
  };
};

export default React.memo(NeptyneNotebook);
