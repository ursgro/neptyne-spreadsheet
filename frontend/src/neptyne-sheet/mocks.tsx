import { ThemeProvider } from "@emotion/react";
import { createTheme } from "@mui/material";
import { Shadows } from "@mui/material/styles/shadows";
import { FunctionComponent } from "react";
import { EditorSelection } from "@codemirror/state";

import { noop } from "../codemirror-editor/CodeMirror";
import { createGrid, hasSelectionProtectedCells } from "../SheetUtils";
import NeptyneSheet, { GRID_HEIGHT, GRID_WIDTH, SheetProps } from "./NeptyneSheet";
import { TopCodeEditorProps } from "./TopCodeEditor";
import { SheetAttributes } from "../neptyne-container/NeptyneContainer";
import { getCellContextMenuActions } from "../ContextMenuUtils";
import {
  SheetSearchContext,
  SheetSearchStore,
} from "../sheet-search/sheet-search.store";
import {
  PasteSpecialContext,
  PasteSpecialStore,
} from "./PasteSpecial/paste-special.store";
import { AccessModeContext } from "../access-mode";
import { AccessMode } from "../NeptyneProtocol";

const MockedTopEditorRenderer = (props: TopCodeEditorProps) => {
  const { value, onUpdate } = props;

  return (
    <input
      ref={(node) => node?.focus()}
      data-testid="top-data-editor"
      className="top-data-editor"
      value={value}
      onChange={(e) => {
        const value = e.target.value;
        onUpdate &&
          onUpdate({
            value: value,
            dynamicContentEnd: value.length,
            dynamicContentStart: value.length,
            editorSelection: EditorSelection.single(value.length),
          });
      }}
    />
  );
};

const MOCK_THEME = createTheme({
  palette: {
    primary: {
      main: "#3f51b5",
    },
  },
  shadows: Array(25).fill("none") as Shadows,
});

const MOCK_GRID = createGrid(GRID_WIDTH, GRID_HEIGHT);

const MOCK_SELECTION = { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } };

const MOCK_SHEET_ATTRIBUTES_ONLY = {} as SheetAttributes;

const MOCK_GET_AUTOCOMPLETE = () => Promise.resolve({ result: [] });

const MOCK_MENU_ACTIONS = getCellContextMenuActions(
  hasSelectionProtectedCells(MOCK_GRID, MOCK_SELECTION),
  false,
  false,
  MOCK_SELECTION,
  MOCK_GRID[MOCK_SELECTION.start.col][MOCK_SELECTION.start.row].attributes ?? {}
);

const MOCK_SHEET_CONTENT_RECT = {
  bottom: 30,
  height: 500,
  left: 0,
  right: 0,
  top: 100,
  width: 1000,
  x: 0,
  y: 0,
} as DOMRectReadOnly;

export const MockedNeptyneSheet: FunctionComponent<Partial<SheetProps>> = (props) => {
  const pasteSpecialStore = new PasteSpecialStore();
  const sheetSearchStore = new SheetSearchStore();
  return (
    <PasteSpecialContext.Provider value={pasteSpecialStore}>
      <SheetSearchContext.Provider value={sheetSearchStore}>
        <AccessModeContext.Provider value={AccessMode.Edit}>
          <ThemeProvider theme={MOCK_THEME}>
            <NeptyneSheet
              onCopyFormat={noop}
              isSearchPanelOpen={false}
              isModalOpen={false}
              dataSheetKey="1-sheet"
              cellContextMenuActions={MOCK_MENU_ACTIONS}
              getAutocomplete={MOCK_GET_AUTOCOMPLETE}
              readOnly={false}
              activeColumn={0}
              activeRow={0}
              grid={MOCK_GRID}
              nRows={GRID_HEIGHT}
              nCols={GRID_WIDTH}
              sheetSelection={MOCK_SELECTION}
              cutSelection={null}
              cutId={null}
              clientRowSizes={[]}
              onCellAttributeChange={noop}
              onSheetAttributeChange={noop}
              onUpdateCellValues={noop}
              onFormulaDrag={noop}
              onCopySelection={noop}
              onClickRow={noop}
              onClickColumn={noop}
              onSelect={noop}
              onWidgetChange={noop}
              onInsertDeleteCells={noop}
              callServerMethod={MOCK_GET_AUTOCOMPLETE}
              topCodeEditorRenderer={MockedTopEditorRenderer}
              onHandleHeaderAutosize={noop}
              onHandleHeaderResize={noop}
              onHandleHeaderUnhide={noop}
              executionPolicyValue={0}
              footerContent={"footer"}
              sidePanelWidth={100}
              sidePanel={null}
              sidePanelVisible={true}
              onResizeCodeEditor={noop}
              isColumnSelected={false}
              isRowSelected={false}
              sheetAttributes={MOCK_SHEET_ATTRIBUTES_ONLY}
              sheetContentRect={MOCK_SHEET_CONTENT_RECT}
              onResizeSheet={noop}
              onBlur={noop}
              isCellIdPicking={false}
              onCellIdPickingComplete={noop}
              onCellIdPickingAbort={noop}
              onMergeCells={noop}
              onUnmergeCells={noop}
              {...props}
              onExecutionPolicyValueChange={noop}
              currentSheetName={"Sheet0"}
              pasteSpecialStore={pasteSpecialStore}
            />
          </ThemeProvider>
        </AccessModeContext.Provider>
      </SheetSearchContext.Provider>
    </PasteSpecialContext.Provider>
  );
};
