import * as React from "react";
import { FocusEvent, MutableRefObject } from "react";
import { v4 as uuid } from "uuid";
import _ from "lodash";
import isEqual from "lodash/isEqual";
import {
  AccessLevel,
  canChangeCellAttributes,
  CellAttributes,
  createGrid,
  CutState,
  executionPolicy,
  getAdjustedCutSelection,
  getNormalizedSelection,
  getRangeOfSelectedDimensions,
  getSelectedDimensions,
  getSelectionClearChanges,
  getSelectionClearChangesWithAttributes,
  getUpdatedTextStyle,
  GridElement,
  hasSelectionProtectedCells,
  hasWidget,
  isCellProtected,
  isEntireDimensionSelected,
  parseCellId,
  rectToSelection,
  selectionToRect,
  SheetLocation,
  SheetSelection,
  SheetUnawareCellAttributeUpdate,
  toCellId,
  TyneAction,
} from "../SheetUtils";

import {
  getKernelSession,
  KernelSession,
  KernelStatus,
  NeptyneMetadata,
  StreamHandler,
} from "../KernelSession";
import { Output } from "../Notebook";
import { saveAs } from "file-saver";
import {
  asString,
  ConnectionState,
  isNumberValue,
  statusToIcon,
  statusToText,
} from "../RenderTools";
import { observer } from "mobx-react";
import NeptyneNotebook, {
  CODE_PANEL_CELL_ID,
  EditorRange,
  getCodeCellDict,
  NBCell,
} from "../notebook/NeptyneNotebook";
import authenticatedFetch, { ensureUser } from "../authenticatedFetch";
import { KernelMessage } from "@jupyterlab/services";
import Cookies from "universal-cookie/cjs/Cookies";
import { EditorState } from "@codemirror/state";
import Confetti from "react-confetti";
import NeptyneSheet, {
  CellChangeWithRowCol,
  GRID_HEIGHT,
  GRID_WIDTH,
} from "../neptyne-sheet/NeptyneSheet";
import { UndoRedoQueue } from "../UndoRedo";
import {
  AccessMode,
  CellAttribute,
  CellChange,
  CLEARABLE_ATTRIBUTES,
  COPYABLE_ATTRIBUTES,
  DeleteSheetContent,
  Dimension,
  InsertDeleteContent,
  InstallRequirementsContent,
  KernelInitState,
  MessageTypes,
  NavigateToContent,
  RenameSheetContent,
  Secrets,
  SheetAttribute,
  SheetAttributeUpdate,
  SheetCellId,
  SheetUnawareCellId,
  TyneEvent,
  WidgetRegistry,
} from "../NeptyneProtocol";
import { IdleShutdownModal } from "../IdleShutdownModal";
import {
  COLUMN_MIN_WIDTH,
  DEFAULT_CELL_WIDTH,
  getColSizes,
  getHiddenColHeaders,
  getHiddenRowHeaders,
  getRowSizes,
  NumberDict,
  ROW_MIN_HEIGHT,
} from "../neptyne-sheet/GridView";
import { NeptyneContainerHotKeys } from "./NeptyneContainerHotKeys";
import { InputModal } from "../InputModal";
import {
  AutocompleteHandler,
  AutocompleteRequest,
  AutocompleteType,
} from "../notebook/NotebookCellEditor/types";
import { ProtectedCellModal } from "../ProtectedCellModal";
import {
  HardReloadSheetMenu,
  SheetsMenuApi,
} from "../neptyne-sheet/SheetMenu/SheetMenu";
import { FileUploadDialog } from "../FileUploadDialog";
import { SheetToolbar, SheetToolbarApi } from "../Toolbars";
import { handleCellBorders } from "../components/ToolbarControls/border-handler";
import { CellAction } from "../notebook/ReplHistoryCell";
import { ModalDispatch, ModalReducerAction, NeptyneModals } from "./NeptyneModals";
import { fetchForTyne, TUTORIAL_TYNE_ID } from "./fetch-for-tyne";
import {
  OpenGalleryDataWrapper,
  OpenTyneDialogDataWrapper,
} from "../components/OpenDialog/OpenTyneDialogDataWrapper";
import { Backdrop, Box, CircularProgress, Snackbar } from "@mui/material";
import { SystemStyleObject } from "@mui/system";
import memoizeOne from "memoize-one";
import {
  getCellId,
  gridChangesToSheetAware,
  processCellUpdates,
  processGridResize,
  sheetAttributeUpdateToSheetAware,
  updateGrid,
} from "./gridUpdateUtils";
import { CodeMirrorApi } from "../codemirror-editor/CodeMirror";
import {
  CellIdPickingContext,
  CellIdPickingStatus,
  cellIdPickingStore,
} from "../cell-id-picking/cell-id-picking.store";
import { GoogleDriveDoc } from "../google-drive";
import { EMPTY_WIDGET_REGISTRY } from "../components/ToolbarControls/Widgets/widgetConstants";
import { getCellContextMenuActions } from "../ContextMenuUtils";
import { isMobile } from "react-device-detect";
import {
  SheetSearchContext,
  sheetSearchStore,
} from "../sheet-search/sheet-search.store";
import { DimensionSizeCalculator } from "../neptyne-sheet/DimensionSizeCalculator";
import { WidgetDialogDataWrapper } from "../components/ToolbarControls/Widgets/WidgetDialogDataWrapper";
import {
  DEFAULT_FONT_SIZE,
  FONT_SIZE_STEP,
} from "../components/ToolbarControls/FontSizeSelect";
import {
  cellUpdatesToRowIndices,
  rowColAutoresizeStore,
  shouldResizeCell,
} from "../row-col-autoresize/row-col-autoresize.store";
import { toJS } from "mobx";

import { range } from "../react-datasheet/src/DataSheet";
import {
  generateToggleMergeCellsRequest,
  getSelectionWithMergedCells,
  hasMergedCells,
  NavigationDirection,
  overlapsWithMergedCells,
} from "../merge-cells";

import { Location, NavigateFunction } from "react-router-dom";
import { MergedCellValidationModal } from "../MergedCellValidationModal";
import {
  PasteSpecialContext,
  pasteSpecialStore,
} from "../neptyne-sheet/PasteSpecial/paste-special.store";
import APIQuotaNotificationModal from "../APIQuotaNotificationModal";
import { AccessModeContext } from "../access-mode";
import RequirementsModal from "../RequirementsModal";
import { GSheetSecretsModal } from "../SecretsModal";
import { getGSheetAppConfig } from "../gsheet_app_config";
import ResearchPanel, { ResearchMetaData } from "../ResearchPanel";
import { closestMetaData, expandSelection } from "../aiResearch";
import { AdvancedFeaturesAuthorizationModal } from "./AdvancedFeaturesAuthorizationModal";
import { syncTyneMetadata } from "./appsScript";
import { User } from "../user-context";

type Timeout = ReturnType<typeof setTimeout>;

// code editor is not usable on mobile right now, so I figured it would be useful to shrink it by default
const CODE_EDITOR_WIDTH = isMobile ? 200 : 500;

const CONTAINER_SX: SystemStyleObject = {
  backgroundColor: "grey.200",
  display: "flex",
  flexDirection: "column",
  width: "100vw",
  height: isMobile ? "100dvh" : "100vh",
};

const locEqual = (l1: SheetLocation, l2: SheetLocation) => {
  return l1.row === l2.row && l1.col === l2.col;
};

export type SimpleSheetCell =
  | [SheetCellId, string | number, string | null]
  | [SheetCellId, string | number];

export interface FullSheetCell {
  cellId: SheetCellId;
  code: string;
  outputs?: Output[] | string | number;
  attributes?: CellAttributes;
}

export type RemoteSheetCell = FullSheetCell | SimpleSheetCell;

export interface RemoteNotebook {
  cells: NBCell[];
}

export interface RemoteSheet {
  sheet_id: number;
  name: string;
  n_rows: number;
  n_cols: number;
  cells: RemoteSheetCell[];
  sheet_attributes: SheetAttributes;
}

export interface Sheet {
  id: number;
  name: string;
  nRows: number;
  nCols: number;
  cells: RemoteSheetCell[][];
  attributes: SheetAttributes;
}

interface SheetUIState {
  [key: string]: {
    selection: SheetSelection;
    activeSheetCellId: SheetLocation;
  };
}

export interface SheetAttributes {
  [key: string]: any;
  areGridlinesHidden?: boolean;
}

export interface RemoteTyne {
  file_name: string;
  name: string;
  access_level: string;
  notebooks: RemoteNotebook[];
  sheets: RemoteSheet[];
  requirements?: string | null;
  screenshot_url?: string;
  properties: { [key: string]: any };
  published: boolean;
  events: TyneEvent[];
  shard_id: number;
}

interface ViewState {
  codeEditorVisible: boolean;
  currentSheet: number;
  embeddedNotebookMode: boolean;
}

export interface NeptyneContainerState extends ViewState {
  connectionState: ConnectionState;
  showReadonlyScreen: boolean;
  appModeRestricted: boolean;
  isApp: boolean;
  disconnectTimeout: Timeout | null;
  grid: GridElement[][]; // Sheet cells
  cells: {
    [cellId: string]: NBCell;
  }; // REPL cells
  codePanel: NBCell;
  codePanelSnackbar: string | null;
  allowAnonymous: boolean;
  confetti: boolean;
  codePanelHighlight: EditorRange[];
  researchPanelActive: boolean;
  cellOnClipBoard?: NBCell;
  activeSheetCellId: SheetLocation;
  activeSheetCellExpressionBefore: string | null; // the code as it was before this cell became active
  nameLoaded: string;
  tyneId: string;
  tyneShardId: number;
  copySelection: SheetLocation | null;
  sheetSelection: SheetSelection;
  openErrorMessage: string | null;
  snackErrorMessage: string | null;
  notificationMessage: string | null;
  accessLevel: AccessLevel;
  sheetAttributes: SheetAttributes;
  notebookScrollY: number;
  undoRedo: UndoRedoQueue;
  didIdleShutdown: boolean;
  didEditProtectedCells: boolean;
  didFreezeMergedCells: boolean;
  inputPrompt: string | null;
  inputPromptPassword: boolean;
  secretRequestKey: string | null;
  sheets: Sheet[];
  thinking: string | null;
  fileUploadRequested: boolean;
  fileUploadPrompt: string | undefined;
  fileUploadAccept: string | undefined;
  codeEditorWidth: number;
  requirements: string;
  showRequirements: boolean;
  sheetUIState: SheetUIState;
  sheetsOrder: number[];
  sheetContentRect: DOMRectReadOnly;
  cutState: CutState | null;
  shouldFocusNotebook: boolean;
  widgetRegistry?: WidgetRegistry;
  isModalOpen: boolean;
  events: TyneEvent[];
  copyFormatSource?: SheetSelection;
  lastSave?: Date | null;
  apiQuotaWarningService: string | null;
  showAdvancedFeaturesAuthorizationModal: boolean;
  hasStreamlit: boolean;
  initialized: boolean;
  embeddedNotebookMode: boolean;
}

const TYNE_COOKIE_NAME = "tyne";

interface NeptyneContainerProps {
  location: Location;
  navigate: NavigateFunction;
  tyneId?: string;
  user: User | null;

  // used only in tests.
  onKernelSessionInit?: (kernelSession: KernelSession) => void;
}

const indexCells = (cells: RemoteSheetCell[]) => {
  const result: RemoteSheetCell[][] = [];

  for (const cell of cells) {
    const [x, y] = getCellId(cell);
    if (result[x] === undefined) {
      result[x] = [];
    }
    result[x][y] = cell;
  }

  return result;
};

const DEFAULT_CELL_ATTRIBUTES = {};
Object.freeze(DEFAULT_CELL_ATTRIBUTES);

const DEFAULT_SHEET_ATTRIBUTES = {};
Object.freeze(DEFAULT_SHEET_ATTRIBUTES);

const getFirstVisibleHeader = (hiddenHeaders: number[]) => {
  const sortedHiddenHeaders = hiddenHeaders.sort((a, b) => a - b);
  let visibleHeaderIndex = 0;
  for (let i = 0; i <= sortedHiddenHeaders.length; i++) {
    if (sortedHiddenHeaders.indexOf(i) === -1) {
      visibleHeaderIndex = i;
      break;
    }
  }

  return visibleHeaderIndex;
};

export const getHeaderSizesByDimension = (
  grid: GridElement[][],
  sheetAttributes: SheetAttributes,
  dimension: Dimension,
  clientRowSizes: NumberDict
): NumberDict => {
  return dimension === Dimension.Col
    ? getColSizes(sheetAttributes, grid[0].length)
    : getRowSizes(sheetAttributes, grid.length, clientRowSizes);
};

export const getHiddenHeadersByDimension = (
  grid: GridElement[][],
  sheetAttributes: SheetAttributes,
  dimension: Dimension
): number[] => {
  if (dimension === Dimension.Col) {
    return getHiddenColHeaders(sheetAttributes, grid[0].length);
  }
  return getHiddenRowHeaders(sheetAttributes, grid.length);
};

export class NeptyneContainer extends React.Component<
  NeptyneContainerProps,
  NeptyneContainerState
> {
  kernelSession: KernelSession;
  cookies: Cookies;
  modalDispatch: MutableRefObject<ModalDispatch | null>;
  replCellRef = React.createRef<CodeMirrorApi>();
  notebookRef = React.createRef<CodeMirrorApi>();
  sheetMenuRef = React.createRef<SheetsMenuApi>();
  toolbarRef = React.createRef<SheetToolbarApi>();

  constructor(props: NeptyneContainerProps) {
    super(props);

    this.kernelSession = getKernelSession();
    this.cookies = new Cookies();

    this.handleAutocomplete = this.handleAutocomplete.bind(this);
    this.state = this.getEmptyState();

    this.handleRowSelection = this.handleRowColSelection.bind(this, Dimension.Row);
    this.handleColSelection = this.handleRowColSelection.bind(this, Dimension.Col);
    this.changeSelection = this.changeSelection.bind(this);
    this.handleWidgetChange = this.handleWidgetChange.bind(this);
    this.handleCellValuesUpdate = this.handleCellValuesUpdate.bind(this);

    this.modalDispatch = { current: null };
  }

  componentWillUnmount() {
    this.kernelSession.kernel?.dispose();
    window.removeEventListener("offline", this.handleOffline);
    window.removeEventListener("online", this.handleOnline);
  }

  syncStateToHash(newUrl?: string) {
    const viewState: ViewState = this.state;
    const params: [string, string][] = [];
    if (!viewState.codeEditorVisible && !isMobile) {
      params.push(["cev", "false"]);
    }
    if (viewState.currentSheet !== 0) {
      params.push(["cs", viewState.currentSheet.toString()]);
    }
    if (viewState.embeddedNotebookMode) {
      params.push(["enm", "true"]);
    }
    const usp = new URLSearchParams(params);
    const hash = usp.toString();
    console.log("syncStateToHash", { newUrl, hash, params });
    this.props.navigate({ hash }, { replace: true });
  }

  syncHashToState(forceSheetUpdate?: boolean) {
    const hash = this.props.location.hash;
    let codeEditorVisible = !isMobile && !this.state.appModeRestricted;
    let currentSheet = 0;
    let viewStateUpdate: Partial<ViewState> = {};
    if (hash && hash.length > 0) {
      const usp = new URLSearchParams(hash.substring(1));
      const codeEditorVisibleSt = usp.get("cev");
      if (
        (codeEditorVisibleSt === "true" || codeEditorVisibleSt === "false") &&
        !isMobile &&
        !this.state.appModeRestricted
      ) {
        codeEditorVisible = codeEditorVisibleSt === "true";
      }
      const currentSheetSt = usp.get("cs");
      if (currentSheetSt != null) {
        currentSheet = parseInt(currentSheetSt);
      }
      viewStateUpdate["embeddedNotebookMode"] = usp.get("enm") === "true";
    }
    if (currentSheet !== this.state.currentSheet || forceSheetUpdate) {
      this.setSheet(currentSheet);
    }
    if (!isMobile) {
      // Since the default is reversed, just don't respect this option on mobile
      viewStateUpdate["codeEditorVisible"] = codeEditorVisible;
    }
    console.log("syncHashToState", { hash, viewStateUpdate });
    // @ts-ignore
    this.setState(viewStateUpdate);
  }

  getEmptyState(): NeptyneContainerState {
    const { gsWidgetMode } = getGSheetAppConfig();
    return {
      codeEditorVisible: !isMobile,
      allowAnonymous: false,
      currentSheet: 0,
      confetti: false,
      connectionState: ConnectionState.NoTyne,
      showReadonlyScreen: false,
      appModeRestricted: false,
      isApp: false,
      disconnectTimeout: null,
      cells: {},
      codePanel: getCodeCellDict(CODE_PANEL_CELL_ID),
      codePanelSnackbar: null,
      codePanelHighlight: [],
      grid: createGrid(GRID_WIDTH, GRID_HEIGHT),
      activeSheetCellId: {
        row: 0,
        col: 0,
      },
      activeSheetCellExpressionBefore: "",
      copySelection: null,
      sheetSelection: {
        start: {
          row: 0,
          col: 0,
        },
        end: {
          row: 0,
          col: 0,
        },
      },
      openErrorMessage: null,
      notificationMessage: null,
      snackErrorMessage: null,
      nameLoaded: "",
      researchPanelActive: false,
      tyneId: "",
      tyneShardId: 0,
      accessLevel: AccessLevel.EDIT,
      sheetAttributes: {},
      notebookScrollY: 0,
      undoRedo: new UndoRedoQueue(
        this.sendUndoRedo.bind(this),
        this.changeSelection.bind(this)
      ),
      didIdleShutdown: false,
      didEditProtectedCells: false,
      didFreezeMergedCells: false,
      inputPrompt: null,
      inputPromptPassword: false,
      secretRequestKey: null,
      sheets: [],
      sheetUIState: {},
      thinking: null,
      fileUploadRequested: false,
      fileUploadPrompt: undefined,
      fileUploadAccept: undefined,
      codeEditorWidth: CODE_EDITOR_WIDTH,
      requirements: "",
      showRequirements: gsWidgetMode === "package-management",
      sheetsOrder: [],
      sheetContentRect: {
        bottom: 0,
        height: 0,
        left: 0,
        right: 0,
        top: 0,
        width: 0,
        x: 0,
        y: 0,
      } as DOMRectReadOnly,
      cutState: null,
      shouldFocusNotebook: false,
      isModalOpen: false,
      events: [],
      apiQuotaWarningService: null,
      showAdvancedFeaturesAuthorizationModal: false,
      hasStreamlit: false,
      initialized: false,
      embeddedNotebookMode: false,
    };
  }

  presumeConnected() {
    // When we connect to a running and busy kernel, we might not receive a
    // status change message. Set to Connected if we receive anything from the
    // kernel.
    const { connectionState } = this.state;
    if (
      connectionState === ConnectionState.NoTyne ||
      connectionState === ConnectionState.Disconnected ||
      connectionState === ConnectionState.Connecting
    ) {
      this.setState({ connectionState: ConnectionState.Working });
    }
  }

  connectKernelHandlers() {
    const { inGSMode, poppedOut } = getGSheetAppConfig();
    this.kernelSession.statusHandler = (status: KernelStatus) => {
      switch (status) {
        case "idle":
          this.setConnectionState(ConnectionState.Connected);
          break;
        case "busy":
        case "terminating":
          this.setConnectionState(ConnectionState.Working);
          break;
        case "restarting":
        case "autorestarting":
        case "starting":
          this.setConnectionState(ConnectionState.Connecting);
          break;
        case "dead":
          this.setConnectionState(ConnectionState.Disconnected);
          break;
        case "shutdown":
          this.setConnectionState(ConnectionState.Disconnected);
          if (inGSMode) {
            if (poppedOut) {
              window.close();
            } else {
              google.script.host.close();
            }
          }
          this.setState({ didIdleShutdown: true });
          break;
        case KernelInitState.RunningCodePanel:
          this.setConnectionState(ConnectionState.Initializing);
          break;
        case KernelInitState.InstallingRequirements:
          this.setConnectionState(ConnectionState.InstallingRequirements);
          break;
        case KernelInitState.LoadingSheetValues:
          this.setConnectionState(ConnectionState.LoadingValues);
          break;
        case "unknown":
          if (this.state.connectionState === ConnectionState.Connecting) {
            // Ignore this update. The jupyter component always broadcasts an "unknown" when we
            // begin to connect to a new kernel, which is misleading.
          } else {
            this.setConnectionState(ConnectionState.Disconnected);
          }
          break;
        default:
          throw new Error(`Unhandled status: ${status}`);
      }
    };

    this.kernelSession.processKernelReply = (cellId: string, output: Output) => {
      this.presumeConnected();
      const parsed = parseCellId(cellId);
      if (parsed.notebookCell) {
        if (parsed.y === 0) {
          this.setState(({ codePanel }) => ({
            codePanel: {
              ...codePanel,
              outputs: [...codePanel.outputs, output],
            },
          }));
        } else {
          this.updateNotebookCell(cellId, (cell) => {
            if (!cell) {
              cell = getCodeCellDict(cellId);
              cell.metadata.clientDate = new Date().toISOString();
            }
            if (cell.cell_type === "code") {
              return { ...cell, outputs: [...(cell.outputs || []), output] };
            }
            console.log(
              `ERROR: cell ${parsed.y} got an output, but is not a code cell`
            );
            return cell;
          });
          if ((output as any)["ename"] === "GSheetNotAuthorized") {
            this.showAdvancedFeaturesAuthorizationModal();
          }
        }
      } else {
        const { x, y, sheetId } = parsed;
        this.modifyCell([x, y, sheetId!], (cell) => {
          return {
            ...cell,
            outputs: [output],
          };
        });
      }
    };

    this.kernelSession.processCellUpdateMessage = (cellUpdates) => {
      this.presumeConnected();
      const prevAutosizeRows = cellUpdatesToRowIndices(cellUpdates, this.state.grid);
      this.setState((prevState) => {
        const { grid, sheets } = processCellUpdates(
          prevState,
          cellUpdates,
          this.state.sheetAttributes
        );
        const rowIds = [
          ...prevAutosizeRows,
          ...cellUpdatesToRowIndices(cellUpdates, grid),
        ];
        if (rowIds.length) {
          rowColAutoresizeStore.startClientResizeFromRowIds(rowIds);
        }
        return {
          ...prevState,
          sheets,
          grid,
        };
      });
    };

    this.kernelSession.processInsertDeleteReply = (insertDeleteReply) => {
      const { n_rows, n_cols, sheet_attribute_updates, cell_updates, sheet_id } =
        insertDeleteReply;
      this.setState((prevState) =>
        processCellUpdates(
          processGridResize(prevState, sheet_id, n_cols, n_rows),
          cell_updates,
          this.state.sheetAttributes
        )
      );
      for (const [key, value] of Object.entries(sheet_attribute_updates)) {
        this.updateSheetAttribute(key, value, sheet_id);
      }
      // ideally we could pinpoint rows to resize, but we don't explicitly get rows we inserted/deleted.
      // We could extract them from cell_updates if needed
      this.shouldAutoResize(this.state.grid) &&
        rowColAutoresizeStore.startFullClientResize(this.state.grid);
    };

    this.kernelSession.processSheetAttributeUpdate = (update) => {
      this.updateSheetAttribute(update.attribute, update.value, update.sheetId);

      if (this.state.currentSheet !== update.sheetId) {
        return;
      }

      // run UI updates if server sent attributes of current sheet
      this.shouldAutoResize(this.state.grid) &&
        rowColAutoresizeStore.startFullClientResize(this.state.grid);

      if (update.attribute === SheetAttribute.ColsSizes) {
        const sheet = this.getSheet(update.sheetId, this.state.sheets);
        if (sheet) {
          this.setState({
            grid: updateGrid(
              createGrid(sheet.nCols, sheet.nRows),
              _.flatten(sheet.cells),
              sheet.attributes,
              true
            ),
          });
        }
      }
      if (update.attribute === "colsFrozenCount") {
        const sheet = this.getSheet(update.sheetId, this.state.sheets);
        if (sheet) {
          this.setState({
            grid: updateGrid(
              createGrid(sheet.nCols, sheet.nRows),
              _.flatten(sheet.cells),
              sheet.attributes,
              true
            ),
          });
        }
      }
    };

    this.kernelSession.processInputRequest = (msg) => {
      this.setState({
        secretRequestKey: (msg.parent_header as any).neptyne_secret_request || null,
        inputPrompt: msg.content.prompt,
        inputPromptPassword: msg.content.password,
      });
    };

    this.kernelSession.processFileUploadRequest = (prompt, accept) => {
      this.setState({
        fileUploadRequested: true,
        fileUploadPrompt: prompt,
        fileUploadAccept: accept,
      });
    };

    this.kernelSession.processStreamMessage = (cellId: string | undefined, msg) => {
      this.presumeConnected();
      if (cellId === undefined) {
        console.warn("received stream message without cell id:", msg);
        return;
      }
      const parsed = parseCellId(cellId);
      if (parsed.notebookCell) {
        const output = { ...msg.content, output_type: "stream" } as Output;
        this.updateNotebookCell(cellId, (c) => {
          const outputs = c?.outputs || [];
          const cellFromServer = (msg.content as any)["cell"] as NBCell | undefined;
          const cell = cellFromServer || c || getCodeCellDict(cellId);
          return { ...cell, outputs: [...outputs, output] };
        });
      }
    };

    this.kernelSession.procesServerError = (error) => {
      this.setState({
        snackErrorMessage: `Internal server error ${error.ename} ${error.evalue}`,
      });
      // Logs ansi, but better than nothing:
      for (let line of error.traceback) {
        console.error(line);
      }
    };

    this.kernelSession.handleDownload = (downloadRequest) => {
      const url = `data:${downloadRequest.mimetype};base64,${downloadRequest.payload}`;
      fetch(url)
        .then((res) => res.blob())
        .then((blob) => {
          saveAs(blob, downloadRequest.filename);
        });
    };

    this.kernelSession.showAlert = (msg) => {
      this.setState({
        snackErrorMessage: msg,
      });
    };

    this.kernelSession.confetti = (duration) => {
      this.setState({
        confetti: true,
      });
      setTimeout(() => {
        this.setState({
          confetti: false,
        });
      }, duration * 1000);
    };

    this.kernelSession.undoMsgReceived = (msg) => {
      const { undoRedo } = this.state;
      undoRedo.undoMsgReceived(msg);
    };

    this.kernelSession.executeInputHandler = (
      cellId: string,
      cell: NBCell,
      changedLineNumbers
    ) => {
      this.presumeConnected();
      // We used to clear execution_count here, but we may process this message
      // after the execute_reply message, which would put the cell in a state
      // of forever-executing.
      this.setNotebookCell(cellId, cell);
      if (changedLineNumbers) {
        const doc = EditorState.create({ doc: cell.source }).doc;
        // Skip lines out of range or that are empty:
        const codePanelHighlight = changedLineNumbers
          .filter(
            (lineNumber) =>
              lineNumber >= 1 &&
              lineNumber < doc.lines &&
              doc.line(lineNumber).to !== doc.line(lineNumber).from
          )
          .map((lineNumber) => doc.line(lineNumber));
        this.setState({
          codePanelHighlight,
        });
      }
    };

    this.kernelSession.executeReplyHandler = (
      cellId: string | undefined,
      cell: NBCell | undefined,
      metadata: NeptyneMetadata | undefined
    ) => {
      if (metadata !== undefined) {
        this.setState(({ hasStreamlit }) => ({
          hasStreamlit: Object.keys(metadata.streamlit).length > 0,
          initialized: metadata.initialized,
        }));
      }
      if (cellId !== undefined && cell !== undefined) {
        this.presumeConnected();
        if (parseCellId(cellId).notebookCell) {
          this.setNotebookCell(cellId, cell);
        }
      }
    };

    this.kernelSession.acknowledgeRunCellsHandler = (cell: NBCell) => {
      const cellId = cell.cell_id;
      this.setNotebookCell(cellId, cell);
    };

    this.kernelSession.rerunCellsHandler = (changedFunctions) => {
      if (inGSMode && !poppedOut) {
        google.script.run.rerunChangedFunctions(changedFunctions);
      }
    };

    this.kernelSession.processCreateSheet = this.onNewSheet;

    this.kernelSession.processPropertyUpdate = (update) => {
      for (const change of update.changes) {
        if (change.property === "sheetsOrder") {
          this.setState({ sheetsOrder: change.value });
        }
      }
    };

    this.kernelSession.processEventLog = (tyneEvent) => {
      this.setState((prevState) => {
        const { events } = prevState;
        return {
          events: [...events, tyneEvent],
        };
      });
    };

    this.kernelSession.processTyneRename = (name: string) => {
      this.setState({ nameLoaded: name });
    };

    this.kernelSession.reloadKernelState = (remoteTyne: RemoteTyne) => {
      this.loadRemoteTyne(remoteTyne, this.props.user, true);
    };

    this.kernelSession.processRenameSheet = (rename: RenameSheetContent) => {
      const { sheets } = this.state;
      const newSheets = sheets.map((sheet) => {
        if (sheet.id === rename.sheetId) {
          return { ...sheet, name: rename.name };
        }
        return sheet;
      });
      this.setState({
        sheets: _.sortBy(newSheets, "id"),
      });
    };

    this.kernelSession.processDeleteSheet = (del: DeleteSheetContent) => {
      const { currentSheet, sheets } = this.state;
      const newSheets = _.sortBy(
        sheets.filter((sheet) => sheet.id !== del.sheetId),
        "id"
      );
      this.setState({
        sheets: newSheets,
      });

      if (currentSheet === del.sheetId) {
        const ix = sheets.findIndex((sheet) => sheet.id === del.sheetId);
        if (ix === sheets.length - 1) {
          this.setSheet(sheets[ix - 1].id, newSheets);
        } else if (ix >= 0) {
          this.setSheet(sheets[ix + 1].id, newSheets);
        }
      }
    };

    this.kernelSession.processRequirementsUpdate = (
      msg: InstallRequirementsContent
    ) => {
      this.setState({
        requirements: msg.requirements,
      });
    };

    this.kernelSession.processNavigateTo = (msg: NavigateToContent) => {
      if (this.state.currentSheet !== msg.sheet) {
        this.setSheet(msg.sheet);
      }

      this.setState({
        sheetSelection: {
          start: { row: msg.row, col: msg.col },
          end: { row: msg.row, col: msg.col },
        },
      });
    };

    this.kernelSession.onSaved = (when) => {
      this.setState({
        lastSave: when,
      });
    };

    this.kernelSession.onShowApiQuotaWarning = (service) => {
      this.setState({ apiQuotaWarningService: service });
    };
  }

  handleOffline = () => {
    this.setConnectionState(ConnectionState.Disconnected);
  };

  handleOnline = () => {
    if (
      this.kernelSession.kernel &&
      this.state.connectionState === ConnectionState.Disconnected
    ) {
      this.setConnectionState(ConnectionState.Connecting);
      this.kernelSession.kernel.requestKernelInfo();
    }
  };

  componentDidMount() {
    window.addEventListener("offline", this.handleOffline);
    window.addEventListener("online", this.handleOnline);

    const { gsheetId } = getGSheetAppConfig();

    this.props.onKernelSessionInit &&
      this.props.onKernelSessionInit(this.kernelSession);
    if (this.props.user !== null) {
      this.connectKernelHandlers();
    }
    const tyneId = this.props.tyneId;

    if (this.props.location.pathname.endsWith("/gallery")) {
      setTimeout(() => {
        this.handleOpenGallery();
      }, 0);
    } else if (gsheetId) {
      this.tyneAction(TyneAction.OpenLinkedForGsheet, gsheetId);
    } else if (!tyneId) {
      this.showOpenTyneDialog({
        notificationMessage: null,
      });
    } else {
      if (tyneId === "_new") {
        if (this.props.user) {
          this.tyneAction(TyneAction.New, tyneId);
        } else {
          this.tyneAction(TyneAction.Open, "welcome");
        }
      } else {
        this.tyneAction(TyneAction.Open, tyneId);
      }
    }

    window.download = this.download;
    this.syncHashToState();
  }

  componentDidUpdate(prevProps: NeptyneContainerProps) {
    const hash = this.props.location.hash;
    if (hash !== prevProps.location.hash) {
      this.syncHashToState();
    }
  }

  showOpenTyneDialog(statePatch: {
    notificationMessage?: NeptyneContainerState["notificationMessage"];
    openErrorMessage?: NeptyneContainerState["openErrorMessage"];
  }) {
    this.setState((prevState: NeptyneContainerState) => {
      const isNotificationStateEmpty = (
        Object.keys(statePatch) as (keyof typeof statePatch)[]
      ).some((field) => !prevState[field]);
      if (isNotificationStateEmpty) this.handleOpenTyneDialog();
      return {
        ...prevState,
        ...statePatch,
      };
    });
  }

  // Ugh: sheet attribute changes are processed when sending out, not when coming in
  private sendUndoRedo(msg: KernelMessage.IShellMessage) {
    // so for undo/redo we have to explicitly call them:
    const msgType: string = msg.header.msg_type;
    if (msgType === MessageTypes.ChangeSheetAttribute) {
      const { attribute, value, sheetId }: SheetAttributeUpdate = msg.content as any;
      this.updateSheetAttribute(attribute, value, sheetId);
    }
    this.kernelSession.sendUndoRedo(msg);
  }

  deleteTyne = () => {
    const user = ensureUser(this.props.user);
    this.kernelSession.kernel?.dispose();
    this.kernelSession = getKernelSession();
    this.setState({ ...this.getEmptyState(), thinking: "Deleting tyne" });
    authenticatedFetch(
      user,
      `/ws/${this.state.tyneShardId}/api/tyne_delete/${this.state.tyneId}`,
      {
        method: "POST",
      }
    ).then((response) => {
      this.setState({ thinking: null, connectionState: ConnectionState.NoTyne });
      if (response.ok) {
        this.showOpenTyneDialog({ notificationMessage: "The Tyne has been deleted." });
      } else {
        this.showOpenTyneDialog({
          openErrorMessage: "Something went wrong deleting the tyne.",
        });
      }
    });
  };

  dismissAlert = () => {
    this.setState({ snackErrorMessage: null });
  };

  editorOnlyMode = (): boolean => {
    const { inGSMode, poppedOut } = getGSheetAppConfig();
    return inGSMode || poppedOut;
  };
  loadRemoteTyne = (remoteTyne: RemoteTyne, user: User | null, reload: boolean) => {
    const [codeCell, ...replCells] = remoteTyne.notebooks[0].cells;
    const sheets = _.sortBy(remoteTyne.sheets, "sheet_id");
    const currentSheet = sheets[0].sheet_id;
    const sheetsOrder = reload
      ? this.state.sheetsOrder
      : remoteTyne.properties["sheetsOrder"];
    const appModeRestricted = reload
      ? this.state.appModeRestricted
      : !!remoteTyne.properties["app_mode"];
    const accessLevel = reload
      ? this.state.accessLevel
      : (remoteTyne.access_level as AccessLevel);
    const isApp = reload ? this.state.isApp : !!remoteTyne.properties["is_app"];
    const allowAnonymous = reload
      ? this.state.allowAnonymous
      : remoteTyne.file_name === TUTORIAL_TYNE_ID ||
        (remoteTyne.published && !!remoteTyne.screenshot_url) ||
        appModeRestricted ||
        isApp;
    const showReadonlyScreen = reload
      ? this.state.showReadonlyScreen
      : (accessLevel === AccessLevel.VIEW || !user) && !allowAnonymous && !isApp;
    const { sheetUIState } = this.state;
    this.setState(
      {
        cells: {
          ...replCells.reduce((acc: { [cid: string]: NBCell }, cell) => {
            acc[cell.cell_id] = cell;
            return acc;
          }, {}),
        },
        codePanel: (codeCell as NBCell) || getCodeCellDict(CODE_PANEL_CELL_ID),
        tyneId: reload ? this.state.tyneId : remoteTyne.file_name,
        tyneShardId: reload ? this.state.tyneShardId : remoteTyne.shard_id,
        nameLoaded: reload ? this.state.nameLoaded : remoteTyne.name,
        currentSheet: reload ? this.state.currentSheet : currentSheet,
        requirements: reload ? this.state.requirements : remoteTyne.requirements || "",
        sheetUIState: sheets.reduce((ui: SheetUIState, sheet) => {
          if (reload && sheetUIState[sheet.sheet_id]) {
            ui[sheet.sheet_id] = sheetUIState[sheet.sheet_id];
          } else {
            ui[sheet.sheet_id] = {
              selection: { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
              activeSheetCellId: { row: 0, col: 0 },
            };
          }
          return ui;
        }, {}),
        accessLevel,
        appModeRestricted,
        isApp,
        allowAnonymous,
        showReadonlyScreen: showReadonlyScreen,
        openErrorMessage: null,
        snackErrorMessage: null,
        thinking: null,
        notificationMessage: null,
        sheets: sheets.map((sheet) => ({
          id: sheet.sheet_id,
          name: sheet.name,
          nRows: sheet.n_rows,
          nCols: sheet.n_cols,
          attributes: sheet.sheet_attributes,
          cells: indexCells(sheet.cells),
        })),
        sheetsOrder: sheetsOrder || sheets.map(({ sheet_id }) => sheet_id),
        events: remoteTyne.events || [],
      },
      () => {
        if (allowAnonymous && !user) {
          this.showOpenTyneDialog({
            notificationMessage: null,
          });
        }
        if (!reload && !this.editorOnlyMode()) {
          const newUrl =
            "/-/" +
            encodeURIComponent(remoteTyne.file_name) +
            window.location.search +
            window.location.hash;
          console.log("Navigating to", newUrl);
          if (this.props.tyneId === "_new") {
            this.props.navigate(newUrl, { replace: true });
          } else if (this.props.location.pathname === newUrl) {
            // Loading because of url change. We load the current sheet from the hash
            // so no need to do it explicitly:
            this.syncHashToState(true);
            return;
          } else {
            this.props.navigate(newUrl);
          }
        }
        this.setSheet(this.state.currentSheet);
      }
    );
  };

  tyneAction = (
    action: TyneAction,
    payload: string | undefined | File | GoogleDriveDoc
  ) => {
    const { user } = this.props;

    const thinking = (action: TyneAction) => {
      switch (action) {
        case TyneAction.New:
          return "Creating new tyne";
        case TyneAction.Open:
        case TyneAction.OpenLinkedForGsheet:
          return "Opening tyne";
        case TyneAction.Import:
          return "Saving tyne";
        case TyneAction.Copy:
          return "Copying tyne";
        case TyneAction.Clone:
          return "Making a copy of the gallery tyne";
        case TyneAction.ImportGoogle:
          return "Importing tyne from Google Sheets";
      }
    };

    this.setState({ thinking: thinking(action) });

    fetchForTyne(user, action, payload, this.state.tyneId)
      .then(({ remoteTyne }) => {
        if (this.props.user !== null) {
          const expiration = new Date();
          expiration.setTime(expiration.getTime() + 1000 * 3600 * 24 * 365);
          this.cookies.set(TYNE_COOKIE_NAME, remoteTyne.file_name, {
            path: "/",
            expires: expiration,
          });
        }

        const { poppedOut } = getGSheetAppConfig();
        if (action === TyneAction.OpenLinkedForGsheet && !poppedOut) {
          try {
            syncTyneMetadata();
          } catch (e) {
            console.error(e);
            return;
          }
        }

        if (user !== null) {
          this.setState({ connectionState: ConnectionState.Connecting });
          this.kernelSession
            .connect(user, remoteTyne.file_name, remoteTyne.shard_id)
            .catch((e) => {
              console.error(e);
              this.setState({
                connectionState: ConnectionState.Disconnected,
                snackErrorMessage:
                  "Server connection error: failed to connect to server",
              });
            })
            .then(() => this.kernelSession.ping())
            .then(() => {
              this.kernelSession.getWidgetRegistry().then((widgetRegistry) => {
                this.setState({ widgetRegistry });
              });
            });
        }

        this.loadRemoteTyne(remoteTyne, user, false);
      })
      .catch((errorMessage: string) =>
        this.showOpenTyneDialog({ openErrorMessage: errorMessage })
      );
  };

  createNewSheet = () => {
    this.kernelSession.createNewSheet();
  };

  importCsv = () => {
    this.callServerMethod("upload_csv_to_new_sheet", [], {}).then((result) => {
      if (result.result > -1) {
        this.setSheet(result.result);
      }
    });
  };

  deleteSheet = (id: number) => this.kernelSession.deleteSheet(id);

  renameSheet = (id: number, name: string) => {
    this.kernelSession.renameSheet(id, name);
  };

  onNewSheet = (newSheet: RemoteSheet, selfReply: boolean) => {
    const { sheets, sheetUIState } = this.state;
    const newSheets = [
      ...sheets,
      {
        id: newSheet.sheet_id,
        name: newSheet.name,
        cells: indexCells(newSheet.cells),
        attributes: newSheet.sheet_attributes,
        nRows: newSheet.n_rows,
        nCols: newSheet.n_cols,
      },
    ];
    const newSheetUIState: SheetUIState = {
      ...sheetUIState,
      [newSheet.sheet_id]: {
        selection: { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
        activeSheetCellId: { row: 0, col: 0 },
      },
    };
    this.setState({
      sheets: _.sortBy(newSheets, "id"),
      sheetUIState: newSheetUIState,
    });
    if (selfReply) {
      this.setSheet(newSheet.sheet_id);
    }
  };

  setSheet = (sheetId: number, sheets?: Sheet[]) => {
    if (this.editorOnlyMode()) {
      return;
    }
    const sheet = this.getSheet(sheetId, sheets);
    if (sheet === undefined) {
      console.error(`No such sheet: ${sheetId}`);
      return;
    }
    const grid = updateGrid(
      createGrid(sheet.nCols, sheet.nRows),
      _.flatten(sheet.cells),
      sheet.attributes,
      true
    );
    const newSheetUI: SheetUIState = {
      ...this.state.sheetUIState,
      [this.state.currentSheet]: {
        selection: this.state.sheetSelection,
        activeSheetCellId: this.state.activeSheetCellId,
      },
    };
    this.setState(
      {
        grid,
        activeSheetCellExpressionBefore: grid[0][0].expression,
        sheetAttributes: sheet.attributes,
        currentSheet: sheet.id,
        sheetSelection: newSheetUI[sheetId].selection,
        sheetUIState: newSheetUI,
        activeSheetCellId: newSheetUI[sheetId].activeSheetCellId,
      },
      () => {
        this.syncStateToHash();
        rowColAutoresizeStore.setClientRowSizes({});
        this.shouldAutoResize(this.state.grid) &&
          rowColAutoresizeStore.startFullClientResize(this.state.grid);
      }
    );
  };

  getSheet = (sheetId: number, sheets?: Sheet[]) => {
    if (sheets === undefined) {
      sheets = this.state.sheets;
    }
    return _.find(sheets, (s) => s.id === sheetId);
  };

  setConnectionState(newState: ConnectionState) {
    const oldState = this.state.connectionState;
    if (
      oldState !== ConnectionState.Disconnected &&
      newState === ConnectionState.Disconnected
    ) {
      this.setState({
        disconnectTimeout: setTimeout(() => {
          this.setState({ connectionState: ConnectionState.Disconnected });
        }, 250),
      });
    } else {
      const { disconnectTimeout } = this.state;
      if (disconnectTimeout) {
        clearTimeout(disconnectTimeout);
      }
      this.setState({ disconnectTimeout: null, connectionState: newState });
    }
  }

  renameTyne = (name: string) => {
    this.kernelSession.renameTyne(name);
  };

  private modifyCell(
    cellId: SheetCellId,
    modifier: (cell: RemoteSheetCell) => RemoteSheetCell
  ) {
    const [x, y, sheetId] = cellId;
    const sheet = this.getSheet(sheetId);
    if (sheet !== undefined) {
      let cell = sheet.cells[x]?.[y];
      if (cell === undefined) {
        // It is possible the cell does not exist yet: e.g., we've changed an
        // empty cell's background color
        cell = {
          cellId,
          code: "",
          attributes: {},
        };
      }
      this.setState((prevState) =>
        processCellUpdates(prevState, [modifier(cell)], this.state.sheetAttributes)
      );
    }
  }

  updateCellValues(
    changes: CellChangeWithRowCol[],
    copySelection: SheetLocation | null,
    cutId?: string | null,
    operationId?: string,
    didPaste?: boolean,
    operationSheet?: number
  ) {
    const currentSheet =
      operationSheet == null ? this.state.currentSheet : operationSheet;
    const { grid, sheetSelection, cutState } = this.state;

    const isCutPaste = cutState !== null && cutId === cutState.id;
    const cutChanges = isCutPaste ? getSelectionClearChanges(cutState.selection) : [];
    const currentGridChanges =
      cutState?.sheetId === currentSheet ? cutChanges.concat(changes) : changes;

    if (
      currentGridChanges.some(({ row, col }) =>
        isCellProtected(grid?.[row]?.[col], this.state.appModeRestricted)
      )
    ) {
      if (!this.state.appModeRestricted) {
        this.setState({ didEditProtectedCells: true });
      }
      return;
    }

    let nextGrid = grid;
    let cellChanges: CellChange[] = [];

    if (isCutPaste) {
      [nextGrid, cellChanges] = gridChangesToSheetAware(
        nextGrid,
        cutChanges,
        cutState.sheetId,
        cutState.sheetId === currentSheet
      );
    }

    const mainChanges = gridChangesToSheetAware(
      nextGrid,
      changes,
      currentSheet,
      !(currentSheet === operationSheet)
    );
    nextGrid = mainChanges[0];
    cellChanges.push(...mainChanges[1]);

    // if user removed newline, we won't autosize the row anymore. But we have to do it one last
    // time before the submit, while we have the data
    const rowIds = changes
      .filter(
        ({ row, col, attributes }) =>
          (shouldResizeCell(grid[row]?.[col]) &&
            !shouldResizeCell(nextGrid[row]?.[col])) ||
          (didPaste && attributes?.[CellAttribute.FontSize])
      )
      .map(({ row }) => row);

    this.setState({ grid: nextGrid, cutState: null });

    if (rowIds.length) {
      rowColAutoresizeStore.startClientResizeFromRowIds(rowIds);
    }
    let msg: KernelMessage.IShellMessage;
    if (copySelection && !isCutPaste) {
      const { row, col } = copySelection;
      msg = this.kernelSession.sheetCopy(
        {
          anchor: toCellId(col, row, currentSheet),
          toCopy: cellChanges,
        },
        operationId
      );
    } else {
      msg = this.kernelSession.runCells(
        {
          toRun: cellChanges,
          notebook: false,
          forAI: false,
          currentSheet: currentSheet,
        },
        operationId
      );
    }

    this.state.undoRedo.prepareUndo(msg, sheetSelection);
  }

  sheetAttributeChange = (name: string, newValue: any) => {
    if ((name === "colsFrozenCount" || name === "rowsFrozenCount") && newValue !== 0) {
      if (
        overlapsWithMergedCells(
          name === "colsFrozenCount" ? Dimension.Col : Dimension.Row,
          newValue as number,
          this.state.grid
        )
      ) {
        this.setState({ didFreezeMergedCells: true });
        return;
      }
    }
    const msg = this.kernelSession.changeSheetAttribute({
      attribute: name,
      value: newValue,
      sheetId: this.state.currentSheet,
    });
    this.state.undoRedo.prepareUndo(msg, this.state.sheetSelection);
    this.updateSheetAttribute(name, newValue, this.state.currentSheet);
  };

  handleHeaderResize = (dimension: Dimension, ids: number[], size: number) => {
    const { grid, sheetAttributes, sheetSelection } = this.state;
    const headerSizes = getHeaderSizesByDimension(
      grid,
      sheetAttributes,
      dimension,
      rowColAutoresizeStore.clientRowSizes
    );

    const rangeSelection = getRangeOfSelectedDimensions(sheetSelection, dimension);
    const _ids = new Set(ids);

    const intersection = new Set(
      [...rangeSelection].filter((element) => _ids.has(element))
    );
    const affectedIds =
      intersection.size > 0 &&
      isEntireDimensionSelected(grid, sheetSelection, dimension)
        ? rangeSelection
        : ids;
    const isCol = dimension === Dimension.Col;

    if (size === 0) {
      const hidden = getHiddenHeadersByDimension(grid, sheetAttributes, dimension);
      this.sheetAttributeChange(isCol ? "colsHiddenHeaders" : "rowsHiddenHeaders", [
        ...hidden,
        ...affectedIds,
      ]);
    } else {
      const sheetAttribute = isCol
        ? SheetAttribute.ColsSizes
        : SheetAttribute.RowsSizes;
      affectedIds.forEach((id) => (headerSizes[id] = size));
      this.sheetAttributeChange(sheetAttribute, headerSizes);
    }
  };

  handleHeadersResize = (
    dimension: Dimension,
    idSizeMap: { [id: number]: number },
    isClientResize: boolean
  ) => {
    const { grid, sheetAttributes } = this.state;
    const sheetAttribute =
      dimension === Dimension.Col ? SheetAttribute.ColsSizes : SheetAttribute.RowsSizes;
    const headerSizes = getHeaderSizesByDimension(
      grid,
      sheetAttributes,
      dimension,
      rowColAutoresizeStore.clientRowSizes
    );
    const mergedSizes = { ...headerSizes, ...idSizeMap };

    if (dimension === Dimension.Row) {
      rowColAutoresizeStore.setClientRowSizes(mergedSizes);
    }

    if (!isClientResize) {
      this.sheetAttributeChange(sheetAttribute, mergedSizes);
    }
  };

  shouldAutoResize = memoizeOne((grid: GridElement[][]) =>
    grid.some((row) => row.some((cell) => shouldResizeCell(cell)))
  );

  handleAutosize = (dimension: Dimension, idxs: number[]) => {
    const { grid } = this.state;
    const nonEmptyIdxs: number[] = [];

    // before running autosize, we exclude rows/cols with no values.
    // Even if row/col has non-default size, we leave it as is if it has no values in it.
    // This is what Google Sheets does.
    if (dimension === Dimension.Row) {
      for (const rowIdx of idxs) {
        let hasValues = false;
        for (let colIdx = 0; colIdx < grid[rowIdx].length; colIdx++) {
          const cell = grid[rowIdx][colIdx];
          if (!!cell.value || cell.value === 0) {
            hasValues = true;
          }
        }
        if (hasValues) {
          nonEmptyIdxs.push(rowIdx);
        }
      }
    } else {
      for (const colIdx of idxs) {
        let hasValues = false;
        for (let rowIdx = 0; rowIdx < grid.length; rowIdx++) {
          const cell = grid[rowIdx][colIdx];
          if (!!cell.value || cell.value === 0) {
            hasValues = true;
          }
        }
        if (hasValues) {
          nonEmptyIdxs.push(colIdx);
        }
      }
    }
    rowColAutoresizeStore.startResize(dimension, nonEmptyIdxs, false);
  };

  handleCurrentRowsAutosize = () => {
    const normalizedSelection = getNormalizedSelection(this.state.sheetSelection);
    this.handleAutosize(
      Dimension.Row,
      range(normalizedSelection.start.row, normalizedSelection.end.row)
    );
  };

  handleCurrentColsAutosize = () => {
    const normalizedSelection = getNormalizedSelection(this.state.sheetSelection);
    this.handleAutosize(
      Dimension.Col,
      range(normalizedSelection.start.col, normalizedSelection.end.col)
    );
  };

  handleHeaderUnhide = (dimension: Dimension, ids: number[]) => {
    const { grid, sheetAttributes } = this.state;
    const hidden = getHiddenHeadersByDimension(grid, sheetAttributes, dimension);
    const hiddenNew = [...hidden].filter((index) => !ids.includes(index));
    this.sheetAttributeChange(
      dimension === Dimension.Col ? "colsHiddenHeaders" : "rowsHiddenHeaders",
      hiddenNew
    );
  };

  handleToggleMergeCells = () => {
    if (hasMergedCells(this.state.grid, this.state.sheetSelection)) {
      this.handleUnmergeCells(this.state.sheetSelection);
    } else {
      this.handleMergeCells(this.state.sheetSelection);
    }
  };

  handleonSelectAll = () =>
    this.changeSelection({
      start: { row: 0, col: 0 },
      end: { row: this.state.grid.length - 1, col: this.state.grid[0].length - 1 },
    });

  handleRowColSelection(
    dimension: Dimension,
    position?: number,
    shiftPressed?: boolean
  ) {
    const {
      sheetSelection: {
        start: { [dimension]: selectionStart },
      },
      activeSheetCellId: { [dimension]: defaultPosition },
      grid,
    } = this.state;

    // While grid header clicks should return row/column index, hotkey press will not.
    // Here we're falling back to current active cell dimension index in this case.
    position = position ?? defaultPosition;

    const newSelection = getSelectedDimensions(
      dimension,
      shiftPressed ? selectionStart : position,
      position,
      (dimension === Dimension.Col ? grid.length : grid[0].length) - 1
    );
    this.changeSelection(newSelection);
  }

  // Bound functions from parent above
  handleRowSelection: (row?: number, shiftPressed?: boolean) => void;

  handleColSelection: (col?: number, shiftPressed?: boolean) => void;

  handleHotKeyHeaderHide = (dimension: Dimension) => {
    const { top, bottom, left, right } = selectionToRect(this.state.sheetSelection);
    const start = dimension === Dimension.Col ? left : top;
    const end = dimension === Dimension.Col ? right : bottom;
    this.handleHeaderResize(dimension, _.range(start, end + 1), 0);
    this.changeSelection({
      start: {
        row: dimension === Dimension.Col ? top : bottom + 1,
        col: left,
      },
      end: {
        row: bottom + (dimension === Dimension.Col ? 0 : 1),
        col: right + (dimension === Dimension.Col ? 1 : 0),
      },
    });
  };

  handleHotKeyHeaderUnHide = (dimension: Dimension) => {
    const { grid, sheetAttributes } = this.state;
    const headers = getHiddenHeadersByDimension(grid, sheetAttributes, dimension);
    const firstVisibleHeader = getFirstVisibleHeader(headers);
    const { top, bottom, left, right } = selectionToRect(this.state.sheetSelection);
    const start = dimension === Dimension.Col ? left : top;
    const end = dimension === Dimension.Col ? right : bottom;
    const headersRange = _.range(firstVisibleHeader === start ? 0 : start, end);
    this.handleHeaderUnhide(
      dimension,
      headers.filter((index) =>
        // if the start of selection is after the hidden headers,
        // (i.e. hidden = A-D, first visible = E)
        // then we need to unhide all hidden headers before the selection
        headersRange.includes(index)
      )
    );
  };

  handleInsertDeleteCells = (contents: InsertDeleteContent) => {
    const { currentSheet, cutState } = this.state;
    const msg = this.kernelSession.insertDeleteCells({
      ...contents,
      sheetId: currentSheet,
    });

    if (cutState && cutState.id && cutState?.selection) {
      const adjustedSelection = getAdjustedCutSelection(cutState, contents);
      if (cutState.selection !== adjustedSelection) {
        this.setState({ cutState: { ...cutState, selection: adjustedSelection } });
      }
    }
    this.state.undoRedo.prepareUndo(msg, this.state.sheetSelection);
  };

  private changeSelection(
    selection: SheetSelection,
    options?: {
      direction?: NavigationDirection;
    }
  ) {
    const { sheetSelection, grid } = this.state;

    const numCols = grid[0].length;
    const numRows = grid.length;

    if (selection.end.col >= numCols || selection.end.row >= numRows) {
      return;
    }

    if (selection.start.col < 0 || selection.start.row < 0) {
      return;
    }

    if (
      locEqual(sheetSelection.start, selection.start) &&
      locEqual(sheetSelection.end, selection.end)
    ) {
      return;
    }

    const selectionWithMergedCells = getSelectionWithMergedCells(
      selection,
      grid,
      options?.direction
    );
    const { start } = selectionWithMergedCells;

    const stateUpdateObj: Partial<NeptyneContainerState> = {
      activeSheetCellId: start,
      sheetSelection: selectionWithMergedCells,
      snackErrorMessage: null,
    };

    const sheetCellIdPickingName = this.state.sheets.find(
      ({ id }) => id === this.state.currentSheet && this.state.currentSheet !== 0
    )?.name;
    cellIdPickingStore.handleCellIdPicking(
      selectionWithMergedCells,
      sheetCellIdPickingName
    );
    this.setState(stateUpdateObj as NeptyneContainerState);
  }

  handleMergeCells = (selection: SheetSelection) => {
    const { grid, sheetAttributes } = this.state;
    const frozenCol: number = sheetAttributes.colsFrozenCount;
    const frozenRow: number = sheetAttributes.rowsFrozenCount;

    const updates = generateToggleMergeCellsRequest(grid, selection, "merge");

    if (
      (frozenCol &&
        overlapsWithMergedCells(Dimension.Col, frozenCol, updates.updatedGrid)) ||
      (frozenRow &&
        overlapsWithMergedCells(Dimension.Row, frozenRow, updates.updatedGrid))
    ) {
      this.setState({ didFreezeMergedCells: true });
      return;
    }
    this.setState({ grid: updates.updatedGrid });
    this.handleToggleMerge(updates.valueUpdates, updates.attributeUpdates);
  };

  handleUnmergeCells = (selection: SheetSelection) => {
    const { grid } = this.state;
    const updates = generateToggleMergeCellsRequest(grid, selection, "unmerge");
    this.setState({ grid: updates.updatedGrid });
    this.handleToggleMerge(updates.valueUpdates, updates.attributeUpdates);
  };

  handleToggleMerge = (
    valueUpdates: CellChangeWithRowCol[],
    attributeUpdates: SheetUnawareCellAttributeUpdate[]
  ) => {
    const { grid } = this.state;
    if (valueUpdates.some(({ row, col }) => isCellProtected(grid[row][col]))) {
      this.setState({ didEditProtectedCells: true });
      return;
    }

    let nextGrid = grid;
    let cellChanges: CellChange[] = [];

    const mainChanges = gridChangesToSheetAware(
      nextGrid,
      valueUpdates,
      this.state.currentSheet
    );

    cellChanges.push(...mainChanges[1]);

    const operationId = uuid();

    const attributeUpdateMsg = this.kernelSession.changeCellAttribute(
      {
        updates: sheetAttributeUpdateToSheetAware(
          attributeUpdates,
          this.state.currentSheet
        ),
      },
      operationId
    );

    const valueUpdateMsg = this.kernelSession.runCells(
      {
        toRun: cellChanges,
        notebook: false,
        forAI: false,
        currentSheet: this.state.currentSheet,
      },
      operationId
    );
    this.state.undoRedo.prepareUndo(valueUpdateMsg, this.state.sheetSelection);
    this.state.undoRedo.prepareUndo(attributeUpdateMsg, this.state.sheetSelection);
  };

  private handleWidgetChange(
    row: number,
    col: number,
    value: boolean | string | number | null
  ) {
    const { currentSheet } = this.state;
    const cellId = toCellId(col, row, currentSheet);
    this.kernelSession.widgetValueChanged({
      cellId,
      value,
    });
  }

  private handleCellValuesUpdate(
    changes: CellChangeWithRowCol[],
    didPaste?: boolean,
    cutId?: string | null,
    operationId?: string,
    operationSheet?: number
  ) {
    const { copySelection } = this.state;
    this.updateCellValues(
      changes,
      didPaste ? copySelection : null,
      cutId,
      operationId,
      didPaste,
      operationSheet
    );
  }

  private handleAutofillSubmit(
    populateFromSelection: SheetSelection,
    populateToStart: SheetCellId,
    populateToEnd: SheetCellId,
    grid: GridElement[][]
  ): void {
    const populateFrom: { cellId: SheetCellId; content: string }[] = [];
    for (
      let j = populateFromSelection.start.col;
      j <= populateFromSelection.end.col;
      j++
    ) {
      for (
        let i = populateFromSelection.start.row;
        i <= populateFromSelection.end.row;
        i++
      ) {
        populateFrom.push({ cellId: [j, i, 0], content: grid[i][j].expression ?? "" });
      }
    }
    const msg = this.kernelSession.sheetAutofill({
      populateFrom,
      populateToStart,
      populateToEnd,
    });
    this.state.undoRedo.prepareUndo(msg, populateFromSelection);
  }

  callServerMethod = (method: string, args: any[], kwargs: { [p: string]: any }) => {
    return this.kernelSession.callServerMethod(method, args, kwargs);
  };

  think = (thinking: string | null) => {
    this.setState({ thinking });
  };

  callCurrentSheetServerMethod = (
    method: string,
    args: any[],
    kwargs: { [p: string]: any }
  ) => {
    const { currentSheet } = this.state;
    return this.callServerMethod(method, args, {
      ...kwargs,
      sheetId: currentSheet,
    });
  };

  handleFormulaDrag = (
    populateFromSelection: SheetSelection,
    populateToStart: SheetUnawareCellId,
    populateToEnd: SheetUnawareCellId
  ) => {
    const { grid, currentSheet } = this.state;
    const [startJ, startI] = populateToStart;
    const [endJ, endI] = populateToEnd;
    for (let i = startI; i <= endI; i++) {
      for (let j = startJ; j <= endJ; j++) {
        if (isCellProtected(grid[i][j])) {
          this.setState({ didEditProtectedCells: true });
          return;
        }
      }
    }
    this.handleAutofillSubmit(
      populateFromSelection,
      [...populateToStart, currentSheet],
      [...populateToEnd, currentSheet],
      grid
    );
  };

  handleSelectionCopy = (start: SheetLocation | null, cutId: string | null) => {
    this.setState((prevState) => ({
      copySelection: start,
      cutState: cutId
        ? {
            id: cutId,
            selection: prevState.sheetSelection,
            sheetId: prevState.currentSheet,
          }
        : null,
    }));
  };

  handleCodeEditorResize = (width: number) => this.setState({ codeEditorWidth: width });

  handleSheetContainerResize = (entry: ResizeObserverEntry) => {
    this.setState({
      sheetContentRect: entry.contentRect,
    });
  };

  getClientRowSizes = memoizeOne((clientRowSizes: NumberDict) => toJS(clientRowSizes));

  renderSheet() {
    const {
      activeSheetCellId,
      grid,
      sheetSelection,
      sheetAttributes,
      codeEditorVisible,
      sheetContentRect,
      cutState,
      isModalOpen,
      embeddedNotebookMode,
    } = this.state;
    const { row, col } = activeSheetCellId;
    const clientRowSizes = this.getClientRowSizes(rowColAutoresizeStore.clientRowSizes);
    const { currentSheet } = this.state;
    const currentSheetName = this.state.sheets.find(
      ({ id }) => id === this.state.currentSheet
    )?.name;

    const cellContextMenuActions = getCellContextMenuActions(
      hasSelectionProtectedCells(grid, sheetSelection),
      hasWidget(grid, sheetSelection),
      hasMergedCells(grid, sheetSelection),
      sheetSelection,
      grid[sheetSelection.start.row][sheetSelection.start.col].attributes ??
        DEFAULT_CELL_ATTRIBUTES
    );

    const sumOfSelection: number | null = this.sumSelection(grid, sheetSelection);

    const readOnly = this.readOnly();

    const isColumnSelected =
      sheetSelection.start.row === 0 && sheetSelection.end.row === grid.length - 1;
    const isRowSelected =
      sheetSelection.start.col === 0 &&
      sheetSelection.end.col === grid[0].length - 1 &&
      // Row can be incorrectly chosen as selected when we have only one column.
      // However, it would be better to change behavior of
      // how the context menu handles headers in the future.
      // Preventing row from being selected if col is, since single-column is most possible.
      !isColumnSelected;

    return (
      <>
        <NeptyneSheet
          isSearchPanelOpen={sheetSearchStore.isPanelOpen}
          isModalOpen={isModalOpen}
          dataSheetKey={`${currentSheet}-sheet`}
          currentSheetName={currentSheetName}
          cellContextMenuActions={cellContextMenuActions}
          getAutocomplete={this.handleAutocomplete}
          readOnly={readOnly}
          activeColumn={col}
          activeRow={row}
          grid={grid}
          nRows={grid.length}
          nCols={grid[0].length}
          sheetSelection={sheetSelection}
          cutSelection={cutState?.sheetId === currentSheet ? cutState.selection : null}
          cutId={cutState?.id ?? null}
          sheetAttributes={sheetAttributes ?? DEFAULT_SHEET_ATTRIBUTES}
          clientRowSizes={clientRowSizes}
          sheetContentRect={sheetContentRect}
          callServerMethod={this.callCurrentSheetServerMethod}
          onCellAttributeChange={this.handleCellAttributeChange}
          onSheetAttributeChange={this.sheetAttributeChange}
          onUpdateCellValues={this.handleCellValuesUpdate}
          onFormulaDrag={this.handleFormulaDrag}
          onCopySelection={this.handleSelectionCopy}
          onClickRow={this.handleRowSelection}
          onClickColumn={this.handleColSelection}
          onSelect={this.changeSelection}
          onWidgetChange={this.handleWidgetChange}
          onInsertDeleteCells={this.handleInsertDeleteCells}
          onHandleHeaderAutosize={this.handleAutosize}
          onHandleHeaderResize={this.handleHeaderResize}
          onHandleHeaderUnhide={this.handleHeaderUnhide}
          sidePanel={this.renderSidePanel()}
          sidePanelWidth={this.state.codeEditorWidth}
          onResizeCodeEditor={this.handleCodeEditorResize}
          onResizeSheet={this.handleSheetContainerResize}
          onMergeCells={this.handleMergeCells}
          onUnmergeCells={this.handleUnmergeCells}
          footerContent={this.renderFooter(sumOfSelection)}
          executionPolicyValue={executionPolicy(grid[row][col])}
          onExecutionPolicyValueChange={this.handleExecutionPolicyValueChange}
          sidePanelVisible={codeEditorVisible && !embeddedNotebookMode}
          isColumnSelected={isColumnSelected}
          isRowSelected={isRowSelected}
          isCellIdPicking={
            cellIdPickingStore.cellIdPickingStatus === CellIdPickingStatus.IsPicking
          }
          onCellIdPickingComplete={this.handleReplCellIdPickingComplete}
          onCellIdPickingAbort={this.handleReplCellIdPickingAbort}
          copyFormatSource={this.state.copyFormatSource}
          onCopyFormat={this.handleCopyFormat}
          onBlur={this.handleSheetBlur}
          hideScrollbars={isMobile}
          pasteSpecialStore={pasteSpecialStore}
        />
        {!!rowColAutoresizeStore.resizeDimension &&
          !!rowColAutoresizeStore.resizeIndices?.length && (
            <DimensionSizeCalculator
              grid={grid}
              dimension={rowColAutoresizeStore.resizeDimension}
              indices={toJS(rowColAutoresizeStore.resizeIndices)}
              resizeColWidth={
                this.state.sheetAttributes[SheetAttribute.ColsSizes] ||
                Array(this.state.grid[0].length).fill(DEFAULT_CELL_WIDTH)
              }
              onSizeCalclated={this.handleSizeCalculated}
            />
          )}
      </>
    );
  }

  handleSizeCalculated = (sizes: number[]) => {
    const { resizeDimension, resizeIndices, isClientResize } = rowColAutoresizeStore;
    this.handleHeadersResize(
      resizeDimension!,
      resizeIndices!.reduce((obj, key, idx) => {
        obj[key] = Math.max(
          resizeDimension === Dimension.Row ? ROW_MIN_HEIGHT : COLUMN_MIN_WIDTH,
          sizes[idx]
        );
        return obj;
      }, {} as { [id: number]: number }),
      !!isClientResize
    );
    rowColAutoresizeStore.finishResize();
  };

  handleReplCellIdPickingComplete = () => {
    cellIdPickingStore.handleReplCellIdPickingComplete();
  };

  handleReplCellIdPickingAbort = () => {
    cellIdPickingStore.handleCellIdPickingAbort();
  };

  handleSheetBlur = () => {
    cellIdPickingStore.handleSheetBlur();
  };

  private updateSheetAttribute(
    attribute: string,
    newValue: any | undefined,
    sheetId: number
  ) {
    const { sheets, currentSheet } = this.state;
    let updatedAttributes;
    const updatedSheets = sheets.map((s) => {
      if (s.id === sheetId) {
        updatedAttributes = { ...s.attributes };
        if (newValue === undefined) {
          delete updatedAttributes[attribute];
        } else {
          updatedAttributes[attribute] = newValue;
        }
        return {
          ...s,
          attributes: updatedAttributes,
        };
      } else {
        return s;
      }
    });
    let currentStateUpdate = {};
    if (sheetId === currentSheet && updatedSheets !== undefined) {
      currentStateUpdate = { sheetAttributes: updatedAttributes };
    }
    this.setState({ ...currentStateUpdate, sheets: _.sortBy(updatedSheets, "id") });
  }

  handleSheetsReorder = (sheetsOrder: number[]) => {
    this.setState({ sheetsOrder });
    this.kernelSession.updateTyneProperty({
      changes: [{ property: "sheetsOrder", value: sheetsOrder }],
    });
  };

  handleAutocomplete(request: AutocompleteRequest, type: AutocompleteType) {
    if (type === "property") {
      const { currentSheet } = this.state;
      return this.kernelSession.propertyAutocomplete(
        this.state.activeSheetCellId,
        currentSheet,
        request.expression,
        request.cursorPosition
      );
    } else {
      return this.kernelSession.globalAutocomplete(request.expression, request.kwargs);
    }
  }

  updateNotebookCell(cellId: string, updater: (cell: NBCell | undefined) => NBCell) {
    if (cellId === CODE_PANEL_CELL_ID) {
      this.setState(({ codePanel }) => {
        return { codePanel: { ...updater(codePanel) } };
      });
    } else {
      this.setState(({ cells }) => {
        const newCells = { ...cells };
        newCells[cellId] = updater(newCells[cellId]);
        return { cells: newCells };
      });
    }
  }

  setNotebookCell(cellId: string, cell: NBCell) {
    // Set the cell's state, leaving outputs alone because the server sends them
    // separately.
    this.updateNotebookCell(cellId, (c) => {
      return { ...cell, outputs: c?.outputs || [] };
    });
  }

  handleCellAction = (action: CellAction) => {
    if (action === "open_requirements") {
      this.setState({
        showRequirements: true,
      });
    }
  };

  runCodeCell = () => {
    if (this.readOnly()) {
      return;
    }
    const { codePanel } = this.state;

    this.setState(({ codePanel }) => ({
      codePanel: {
        ...codePanel,
        outputs: [],
        execution_count: null,
      },
    }));
    const source = asString(codePanel.source);
    if (source.trim()) {
      this.kernelSession.runCells({
        toRun: [{ cellId: CODE_PANEL_CELL_ID, content: source }],
        notebook: true,
        forAI: false,
        currentSheet: this.state.currentSheet,
      });
    }
  };

  runRepl = (code: string, forAI: boolean) => {
    if (this.readOnly()) {
      return;
    }
    this.kernelSession.runCells({
      toRun: [{ content: code }],
      notebook: true,
      forAI,
      currentSheet: this.state.currentSheet,
    });
  };

  handleCodeCellChange = (code: string) => {
    this.setState(({ codePanel }) => ({
      codePanel: {
        ...codePanel,
        source: code,
      },
    }));
    // This saves the notebook cell on a character by character basis
    this.kernelSession.saveCell(CODE_PANEL_CELL_ID, asString(code), "code", true);
  };

  handleHighlightChange = (highlight: { from: number; to: number }[]) =>
    !isEqual(highlight, this.state.codePanelHighlight) &&
    this.setState({ codePanelHighlight: highlight });

  handleNotebookScroll = (newY: number) => {
    this.setState({ notebookScrollY: newY });
  };

  handlePopOutEditor = async () => {
    const gsheetAppConfig = getGSheetAppConfig();
    const serverUrlBase = gsheetAppConfig.serverUrlBase || "";
    const params = new URLSearchParams({ poppedOut: "true" });
    params.append(
      "gsheetAppConfig",
      JSON.stringify({
        ...gsheetAppConfig,
        poppedOut: true,
      })
    );
    const url = `${serverUrlBase}/-/${this.state.tyneId}?${params.toString()}`;
    const target = `code_${this.state.tyneId}`;
    const screenWidth = window.screen.width;
    const newWindowWidth = 600;

    const leftPosition = screenWidth - newWindowWidth;

    console.log("Target:", target);
    console.log("Opening:", url);

    const newWindow = window.open(
      url,
      target,
      `width=${newWindowWidth},height=800,left=${leftPosition}`
    );
    if (!newWindow) {
      window.open(url, target);
    }
    if (gsheetAppConfig.inGSMode) {
      google.script.host.close();
    } else {
      this.setState({ codeEditorVisible: false });
    }
  };

  renderNotebook = memoizeOne(
    (
      cells: {
        [cellId: string]: NBCell;
      },
      codePanelCell: NBCell,
      codePanelSnackbar,
      readOnly: boolean,
      codeCellChanged: (source: string) => void,
      onHighlightChange: (highlight: EditorRange[]) => void,
      runCodeCell: () => void,
      scrollY: number,
      onNotebookScrolled: (toY: number) => void,
      getAutocomplete: AutocompleteHandler,
      codeEditorWidth: number,
      runRepl: (code: string, forAI: boolean) => void,
      handleCellAction: (action: CellAction) => void,
      replCellRef: React.RefObject<CodeMirrorApi>,
      notebookRef: React.RefObject<CodeMirrorApi>,
      hideRepl: boolean,
      highlight: EditorRange[] | undefined,
      events: TyneEvent[],
      thinking: (thinking: string | null) => void,
      hasStreamlit: boolean,
      showAdvancedFeaturesAuthorizationModal?: boolean,
      errorBar?: string
    ) => {
      return (
        <>
          {showAdvancedFeaturesAuthorizationModal && (
            <AdvancedFeaturesAuthorizationModal
              onClose={() => {
                this.setState({ showAdvancedFeaturesAuthorizationModal: false });
              }}
            />
          )}
          {codePanelSnackbar && (
            <Snackbar
              open={true}
              autoHideDuration={6000}
              message={codePanelSnackbar}
              onClose={() => {
                this.setState({ codePanelSnackbar: null });
              }}
              anchorOrigin={{ vertical: "top", horizontal: "center" }}
            />
          )}
          <NeptyneNotebook
            getAutocomplete={getAutocomplete}
            codePanelCell={codePanelCell}
            cells={cells}
            readOnly={readOnly}
            codeCellChanged={codeCellChanged}
            onHighlightChange={onHighlightChange}
            runCodeCell={runCodeCell}
            runRepl={runRepl}
            scrollY={scrollY}
            onNotebookScrolled={onNotebookScrolled}
            codeEditorWidth={codeEditorWidth}
            handleCellAction={handleCellAction}
            replCellRef={replCellRef}
            notebookRef={notebookRef}
            hideRepl={hideRepl}
            highlight={highlight}
            events={events}
            thinking={thinking}
            popOutEditor={
              getGSheetAppConfig().poppedOut ? undefined : this.handlePopOutEditor
            }
            errorBar={errorBar}
            hasStreamlit={hasStreamlit}
            displaySnackbar={(message) => this.setState({ codePanelSnackbar: message })}
            connectToKernel={this.reconnectKernel}
          />
        </>
      );
    }
  );

  renderSidePanel = () => {
    const user = this.props.user;

    const { inGSMode, scriptCodeSHA } = getGSheetAppConfig();
    const { gitSHA } = window.APP_CONFIG || {};

    if (this.state.researchPanelActive && user) {
      const fetchGrid = () => {
        const { sheetSelection, grid } = this.state;
        const startRow = Math.min(sheetSelection.start.row, sheetSelection.end.row);
        const startCol = Math.min(sheetSelection.start.col, sheetSelection.end.col);

        const res: GridElement[][] = [];
        for (let i = startRow; i < grid.length; i++) {
          const row = grid[i];
          res.push(row.slice(startCol));
        }
        const selectionWidth =
          Math.abs(sheetSelection.start.col - sheetSelection.end.col) + 1;
        const selectionHeight =
          Math.abs(sheetSelection.start.row - sheetSelection.end.row) + 1;

        return Promise.resolve({
          grid: res,
          selectionWidth,
          selectionHeight,
        });
      };

      const updateMetaData = (
        newValue: ResearchMetaData,
        prevValue: ResearchMetaData
      ) => {
        const { sheetAttributes } = this.state;
        const prevMetaData: ResearchMetaData[] =
          sheetAttributes[SheetAttribute.ResearchMetaData] || [];
        const newMetaData = prevMetaData.filter((m) => _.isEqual(m, prevValue));
        newMetaData.push(newValue);
        this.sheetAttributeChange(SheetAttribute.ResearchMetaData, newMetaData);
      };

      const { sheetSelection, currentSheet, sheetAttributes } = this.state;

      const metaData = closestMetaData(
        sheetSelection,
        sheetAttributes[SheetAttribute.ResearchMetaData]
      );
      return (
        <ResearchPanel
          onClose={() => {
            this.setState({ researchPanelActive: false });
          }}
          sheet={currentSheet}
          sheetSelection={sheetSelection}
          onUpdateSheetSelection={(selection) => {
            this.changeSelection(selection);
          }}
          metaData={metaData}
          user={user}
          onUpdateCellValues={(updates: CellChangeWithRowCol[]) => {
            this.handleCellValuesUpdate(
              updates,
              undefined,
              undefined,
              undefined,
              currentSheet
            );
          }}
          onShowError={(error) => this.setState({ snackErrorMessage: error })}
          onUpdateMetaData={updateMetaData}
          fetchGrid={fetchGrid}
        />
      );
    } else {
      return this.renderNotebook(
        this.state.cells,
        this.state.codePanel,
        this.state.codePanelSnackbar,
        this.readOnly(),
        this.handleCodeCellChange,
        this.handleHighlightChange,
        this.runCodeCell,
        this.state.notebookScrollY,
        this.handleNotebookScroll,
        this.handleAutocomplete,
        this.state.codeEditorWidth,
        this.runRepl,
        this.handleCellAction,
        this.replCellRef,
        this.notebookRef,
        this.props.user === null,
        this.state.codePanelHighlight,
        this.state.events,
        this.think,
        this.state.hasStreamlit,
        this.state.showAdvancedFeaturesAuthorizationModal
      );
    }
  };

  save = () => {
    this.kernelSession.save();
  };

  nameFocus = (event: FocusEvent<HTMLInputElement>) => {
    event.target.select();
  };

  download = (fmt: string) => {
    authenticatedFetch(
      ensureUser(this.props.user),
      "/api/tyne_download/" +
        this.state.tyneId +
        "/" +
        fmt +
        (fmt === "csv" ? "/" + this.state.currentSheet : "")
    ).then((result) => {
      result.blob().then((blob) => {
        if (blob) {
          saveAs(blob, this.state.nameLoaded + "." + fmt);
        } else {
          console.log("Could not download");
        }
      });
    });
  };

  readOnly() {
    const { connectionState } = this.state;
    const accessMode = this.getAccessMode();

    return (
      (accessMode !== AccessMode.Edit && accessMode !== AccessMode.App) ||
      (connectionState !== ConnectionState.Connected &&
        connectionState !== ConnectionState.Working)
    );
  }

  getAccessMode(): AccessMode {
    if (this.props.user === null) {
      // No user here also means we aren't logged in anonymously (as in app mode)
      return AccessMode.ReadOnlyDisconnected;
    } else if (this.state.appModeRestricted) {
      return AccessMode.App;
    } else if (this.state.accessLevel === AccessLevel.EDIT) {
      return AccessMode.Edit;
    }
    return AccessMode.ReadOnlyConnected;
  }

  handleCodeEditorVisibilityChange = (codeEditorVisible: boolean) => {
    this.setState(
      {
        codeEditorVisible,
        // toggling code pane changes how much space is available for grid.
        // If we don't adjust available space at once, we will have visible glitches on
        // opening/closing code pane.
        sheetContentRect: {
          ...this.state.sheetContentRect,
          width: codeEditorVisible
            ? this.state.sheetContentRect.width - this.state.codeEditorWidth
            : this.state.sheetContentRect.width + this.state.codeEditorWidth,
          height: window.screen.height,
        },
      },
      this.syncStateToHash
    );
  };

  handleSheetToggle = (d: number) => {
    const { currentSheet, sheets } = this.state;
    const currentSheetIdx = _.findIndex(sheets, (s) => s.id === currentSheet) || 0;
    let nextSheetIdx = currentSheetIdx + d;
    if (nextSheetIdx > sheets.length - 1) {
      nextSheetIdx = 0;
    } else if (nextSheetIdx < 0) {
      nextSheetIdx = sheets.length - 1;
    }
    this.setSheet(sheets[nextSheetIdx].id);
  };

  handleIdleShutdownModalClose = () => {
    const { tyneId } = this.state;
    this.setState({ didIdleShutdown: false });
    this.tyneAction(TyneAction.Open, tyneId);
  };

  handleAPIQuotaWarningClose = () => {
    this.setState({ apiQuotaWarningService: null });
  };

  handleProtectedCellModalClose = () => {
    this.setState({ didEditProtectedCells: false });
  };

  handleFreezeMergeCellModalClose = () => {
    this.setState({ didFreezeMergedCells: false });
  };

  handleInputModalClose = (value: string) => {
    const { secretRequestKey } = this.state;
    this.setState({
      inputPrompt: null,
      inputPromptPassword: false,
      secretRequestKey: null,
    });
    if (secretRequestKey == null) {
      this.handleInput(value);
    } else {
      this.handleSetSecret(secretRequestKey, value);
    }
  };

  handleReadonlyScreenClose = () => {
    this.setState({
      showReadonlyScreen: false,
    });
  };

  renderToolbarOrModal() {
    const {
      showRequirements,
      snackErrorMessage,
      requirements,
      undoRedo,
      showReadonlyScreen,
      connectionState,
      codeEditorVisible,
      tyneId,
      nameLoaded,
      activeSheetCellId: { row, col },
      grid: {
        [row]: { [col]: activeCell },
      },
      widgetRegistry = EMPTY_WIDGET_REGISTRY,
      initialized,
    } = this.state;

    const { inGSMode, gsWidgetMode } = getGSheetAppConfig();
    if (gsWidgetMode === "package-management") {
      return (
        <RequirementsModal
          open={"fullScreen"}
          onClose={() => {
            if (inGSMode) {
              google.script.host.close();
            } else {
              this.installRequirements();
            }
          }}
          onRun={(reqs, onStream) => this.installRequirements(reqs, onStream)}
          requirements={requirements}
        />
      );
    } else if (gsWidgetMode === "secrets-management") {
      const { user } = this.props;
      if (!user) {
        return null;
      }
      return (
        <GSheetSecretsModal
          user={user}
          tyneId={tyneId}
          onClose={(tyneSecrets) => {
            if (tyneSecrets !== null) {
              this.setSecrets({}, tyneSecrets);
            }
            google.script.host.close();
          }}
        />
      );
    } else if (!this.editorOnlyMode()) {
      // TODO: neptyne in a regular kernel doesn't send back metadata...
      const isInitialized = !!(initialized || this.props.tyneId?.endsWith(".json"));
      return (
        <SheetToolbar
          ref={this.toolbarRef}
          statusIcon={statusToIcon(connectionState, isInitialized)}
          statusText={statusToText(connectionState, isInitialized)}
          tyneId={tyneId}
          tyneName={nameLoaded}
          snackErrorMessage={snackErrorMessage}
          showReadonlyScreen={showReadonlyScreen}
          handleReadonlyScreenClose={this.handleReadonlyScreenClose}
          onDismissAlert={this.dismissAlert}
          onTyneAction={this.tyneAction}
          onRenameTyne={this.renameTyne}
          onDeleteTyne={this.deleteTyne}
          onSave={this.save}
          onDownload={this.download}
          onImportCsv={this.importCsv}
          showCopyPrompt={this.state.accessLevel === AccessLevel.VIEW}
          onNameFocus={this.nameFocus}
          canInterrupt={connectionState === ConnectionState.Working}
          onInterrupt={this.interruptKernel}
          onOpenResearchPanel={() => {
            const { sheetSelection, sheetAttributes } = this.state;
            const singleCell =
              sheetSelection.start.row === sheetSelection.end.row &&
              sheetSelection.start.col === sheetSelection.end.col;
            const researchSelection = singleCell
              ? expandSelection(sheetSelection.start, this.state.grid)
              : sheetSelection;
            const meta = closestMetaData(
              researchSelection,
              sheetAttributes[SheetAttribute.ResearchMetaData]
            );
            this.setState({
              researchPanelActive: true,
              sheetSelection: meta.table,
            });
          }}
          showRequirements={showRequirements}
          requirements={requirements}
          onWidgetControlSelect={this.handleWidgetControlSelect}
          onInstallRequirements={this.installRequirements}
          onSelectionAttributeChange={this.handleSelectionAttributeChange}
          onSheetAttributeChange={this.sheetAttributeChange}
          sheetAttributes={this.state.sheetAttributes ?? DEFAULT_SHEET_ATTRIBUTES}
          readOnly={this.readOnly()}
          undoRedo={undoRedo}
          curCellAttributes={activeCell.attributes || DEFAULT_CELL_ATTRIBUTES}
          curCellValue={activeCell.value}
          user={this.props.user}
          onUpdateCellBorders={this.handleUpdateCellBorders}
          codeEditorVisible={codeEditorVisible}
          setCodeEditorVisible={this.handleCodeEditorVisibilityChange}
          widgetRegistry={widgetRegistry}
          onClearFormatting={this.handleClearCells}
          isCopyingFormat={!!this.state.copyFormatSource}
          onCopyFormatToggle={this.handleCopyFormatToggle}
          setSecrets={this.setSecrets}
          lastSave={this.state.lastSave}
          reconnectKernel={this.reconnectKernel}
          embeddedNotebookMode={this.state.embeddedNotebookMode}
        />
      );
    }
  }

  reconnectKernel = (name: string) => {
    this.kernelSession.reconnect(name);
  };

  render() {
    const {
      accessLevel,
      isApp,
      allowAnonymous,
      confetti,
      sheetSelection,
      currentSheet,
      openErrorMessage,
      nameLoaded,
      notificationMessage,
      tyneId,
      activeSheetCellId: { row, col },
      grid: {
        [row]: { [col]: activeCell },
      },
      widgetRegistry = EMPTY_WIDGET_REGISTRY,
    } = this.state;

    const { gsheetName, inGSMode, gsWidgetMode } = getGSheetAppConfig();
    if (gsheetName) {
      document.title = `${gsheetName} - Neptyne`;
    } else {
      document.title = `${nameLoaded} - Neptyne`;
    }
    if (inGSMode && openErrorMessage) {
      throw new Error(openErrorMessage);
    }

    return (
      <PasteSpecialContext.Provider value={pasteSpecialStore}>
        <SheetSearchContext.Provider value={sheetSearchStore}>
          <CellIdPickingContext.Provider value={cellIdPickingStore}>
            <AccessModeContext.Provider value={this.getAccessMode()}>
              <Box sx={CONTAINER_SX}>
                <NeptyneModals
                  onToggle={this.handleModalToggle}
                  allowAnonymous={
                    isApp && accessLevel === AccessLevel.VIEW
                      ? "auto_login"
                      : allowAnonymous
                      ? "yes"
                      : "no"
                  }
                  ref={this.modalDispatch}
                  tyneId={tyneId}
                  tyneName={nameLoaded}
                  user={this.props.user}
                  errorMessage={openErrorMessage}
                  notificationMessage={notificationMessage}
                  currentCellAttributes={
                    activeCell.attributes ?? DEFAULT_CELL_ATTRIBUTES
                  }
                  getAutocomplete={this.handleAutocomplete}
                  sheetSelection={sheetSelection}
                  currentSheet={currentSheet}
                  widgetRegistry={widgetRegistry}
                  getWidgetState={this.kernelSession.getWidgetState}
                  validateWidgetParams={this.kernelSession.validateWidgetParams}
                  onUpdateCellValues={this.handleCellValuesUpdate}
                  onErrorDisplay={this.kernelSession.showAlert}
                  onCellAttributeChange={this.handleSelectionAttributeChange}
                  onTyneAction={this.tyneAction}
                  onCreateFunctionSubmit={this.handleCreateFunctionSubmit}
                >
                  <NeptyneContainerHotKeys
                    isModalOpen={this.state.isModalOpen}
                    onSelectionAttributeChange={this.handleSelectionAttributeChange}
                    onDownload={this.download}
                    undoRedo={this.state.undoRedo}
                    kernelSession={this.kernelSession}
                    sheetSelection={this.state.sheetSelection}
                    onToggleSheet={this.handleSheetToggle}
                    onNewSheet={this.createNewSheet}
                    onClearCells={this.handleSelectionClear}
                    onUpdateCellBorders={this.handleUpdateCellBorders}
                    onOpenHyperlink={this.handleOpenHyperlink}
                    onHandleHeaderResize={this.handleHotKeyHeaderHide}
                    onHandleHeaderUnhide={this.handleHotKeyHeaderUnHide}
                    onRowSelection={this.handleRowSelection}
                    onToggleMergeCells={this.handleToggleMergeCells}
                    onColSelection={this.handleColSelection}
                    onTyneAction={this.tyneAction}
                    onSearchStart={this.handleSearchStart}
                    onEscape={this.handleEscape}
                    onIncreaseFontSize={this.handleIncreaseFontSize}
                    onDecreaseFontSize={this.handleDecreaseFontSize}
                    onToggleShowGridlines={this.handleToggleShowGridlines}
                    onClearCellFormatting={this.handleClearCells}
                    onCurrentRowsAutosize={this.handleCurrentRowsAutosize}
                    onCurrentColsAutosize={this.handleCurrentColsAutosize}
                    onAddSheet={this.createNewSheet}
                    onDeleteSheet={this.handleDeleteSheet}
                    onRenameSheet={this.handleRenameSheet}
                    onFontChange={this.handleFontChange}
                    onFontColorChange={this.handleFontColorChange}
                    onBackgroundColorChange={this.handleBackgroundColorChange}
                    onSelectAll={this.handleonSelectAll}
                  />
                  {this.renderToolbarOrModal()}

                  <APIQuotaNotificationModal
                    open={this.state.apiQuotaWarningService !== null}
                    service={this.state.apiQuotaWarningService ?? ""}
                    onClose={this.handleAPIQuotaWarningClose}
                  />
                  <IdleShutdownModal
                    open={this.state.didIdleShutdown}
                    onClose={this.handleIdleShutdownModalClose}
                  />
                  <ProtectedCellModal
                    open={this.state.didEditProtectedCells}
                    onClose={this.handleProtectedCellModalClose}
                  />
                  <MergedCellValidationModal
                    open={this.state.didFreezeMergedCells}
                    onClose={this.handleFreezeMergeCellModalClose}
                  />
                  <InputModal
                    prompt={
                      this.state.secretRequestKey
                        ? `This tyne is requesting a value for "${this.state.secretRequestKey}".
                 Enter it here to store it in your user secrets for this tyne.` +
                          (this.state.inputPrompt
                            ? `\n\n${this.state.inputPrompt}`
                            : "")
                        : this.state.inputPrompt
                    }
                    password={this.state.inputPromptPassword}
                    secretRequestKey={this.state.secretRequestKey}
                    onClose={this.handleInputModalClose}
                  />
                  <FileUploadDialog
                    open={this.state.fileUploadRequested}
                    prompt={this.state.fileUploadPrompt || "Upload a file"}
                    title="Upload"
                    accept={this.state.fileUploadAccept || "*"}
                    onClose={this.handleUploadFile}
                  />
                  <Backdrop
                    sx={{ color: "#fff", zIndex: (theme) => theme.zIndex.drawer + 10 }}
                    open={
                      this.state.thinking !== null ||
                      (inGSMode &&
                        this.state.connectionState !== ConnectionState.Connected &&
                        this.state.connectionState !== ConnectionState.Working)
                    }
                  >
                    <span style={{ fontSize: 13, padding: 4 }}>
                      {this.state.thinking}
                    </span>
                    <CircularProgress color="inherit" />
                  </Backdrop>
                  {!gsWidgetMode &&
                    (this.editorOnlyMode()
                      ? this.renderSidePanel()
                      : this.renderSheet())}
                </NeptyneModals>
              </Box>
            </AccessModeContext.Provider>
            {confetti && (
              <Confetti width={window.innerWidth} height={window.innerHeight} />
            )}
          </CellIdPickingContext.Provider>
        </SheetSearchContext.Provider>
      </PasteSpecialContext.Provider>
    );
  }

  handleSearchStart = () => sheetSearchStore.startSearch();

  handleEscape = () => {
    if (sheetSearchStore.isPanelOpen) {
      sheetSearchStore.endSearch();
      return;
    }
    if (this.state.copyFormatSource) {
      this.setState({ copyFormatSource: undefined });
    }
  };

  handleFontChange = () => this.toolbarRef.current?.openFontSelect();

  handleFontColorChange = () => this.toolbarRef.current?.openFontColorSelect();

  handleBackgroundColorChange = () =>
    this.toolbarRef.current?.openBackgroundColorSelect();

  handleDeleteSheet = () => {
    if (
      this.state.currentSheet !== 0 &&
      window.confirm(
        `Are you sure you want to delete sheet ${
          this.state.sheets.find(({ id }) => id === this.state.currentSheet)?.name
        }?`
      )
    ) {
      this.deleteSheet(this.state.currentSheet);
    }
  };

  handleRenameSheet = () => this.sheetMenuRef.current?.renameSheet();

  handleToggleShowGridlines = () =>
    this.sheetAttributeChange(
      "areGridlinesHidden",
      !this.state.sheetAttributes.areGridlinesHidden as any
    );

  handleModalToggle = (isModalOpen: boolean) => this.setState({ isModalOpen });

  handleOpenGallery = () =>
    this.modalDispatch.current?.({
      action: ModalReducerAction.Show,
      props: {
        element: OpenGalleryDataWrapper,
      },
    });

  handleOpenTyneDialog = () =>
    this.modalDispatch.current?.({
      action: ModalReducerAction.Show,
      props: {
        element: OpenTyneDialogDataWrapper,
      },
    });

  handleWidgetControlSelect = (type: string) =>
    this.modalDispatch.current?.({
      action: ModalReducerAction.Show,
      props: {
        element: WidgetDialogDataWrapper,
        elementProps: {
          type,
          sheetSelection: this.state.sheetSelection,
        },
      },
    });

  handleCreateFunctionSubmit = (functionName: string) => {
    const functionBody = `def ${functionName}():\n\tpass\n`;
    const sourceString: string = Array.isArray(this.state.codePanel.source)
      ? this.state.codePanel.source.join("\n")
      : this.state.codePanel.source;
    this.setState(
      ({ codePanel }) => ({
        codePanel: {
          ...codePanel,
          source: sourceString.trim()
            ? sourceString + `\n\n${functionBody}`
            : sourceString + functionBody,
        },
        shouldFocusNotebook: true,
      }),
      () => this.runCodeCell()
    );
  };

  handleInput = (value: string) => {
    this.kernelSession.inputReply(value);
  };

  handleSetSecret = (key: string, value: string) => {
    this.kernelSession.setSecret(key, value);
  };

  interruptKernel = () => {
    console.log("Interrupt");
    this.kernelSession.interrupt();
  };

  installRequirements = (requirements?: string, onStream?: StreamHandler) => {
    if (requirements === undefined) {
      this.setState({ showRequirements: false });
    } else {
      this.kernelSession.installRequirements(requirements, onStream!);
    }
  };

  handleUploadFile = (file: File | null) => {
    const { tyneId, tyneShardId } = this.state;
    const user = ensureUser(this.props.user);
    const formData = new FormData();
    formData.append("tyne_file_name", tyneId!);
    const { authToken } = getGSheetAppConfig();
    if (authToken) {
      formData.append("gsheet_auth_token", tyneId!);
    }
    if (file !== null) {
      formData.append("contents", file);
    }
    this.setState({ fileUploadRequested: false });
    return authenticatedFetch(user, `/ws/${tyneShardId}/api/file_upload`, {
      method: "POST",
      body: formData,
    }).then((response) => {
      if (!response.ok) {
        // Something went wrong -- hit the endpoint again without the file to wake the kernel
        this.setState({ snackErrorMessage: "Error uploading file" });
        const formData = new FormData();
        formData.append("tyne_file_name", tyneId!);
        if (authToken) {
          formData.append("gsheet_auth_token", tyneId!);
        }
        return authenticatedFetch(user, `/ws/${tyneShardId}/api/file_upload`, {
          method: "POST",
          body: formData,
        });
      }
    });
  };

  handleCellAttributeChange = (
    changes: SheetUnawareCellAttributeUpdate[],
    operationId?: string
  ) => {
    for (let change of changes) {
      if (!canChangeCellAttributes(this.state.grid, change.cellId, change.attribute)) {
        this.setState({ didEditProtectedCells: true });
        return;
      }
    }

    const msg = this.kernelSession.changeCellAttribute(
      {
        updates: sheetAttributeUpdateToSheetAware(changes, this.state.currentSheet),
      },
      operationId
    );
    this.state.undoRedo.prepareUndo(msg, this.state.sheetSelection);
  };

  handleSelectionAttributeChange = (
    name: CellAttribute,
    newValue: string | undefined
  ) => {
    let value = newValue;
    if (name === CellAttribute.TextStyle && value) {
      const { grid, activeSheetCellId } = this.state;
      const { row, col } = activeSheetCellId;
      const curCellAttributes: CellAttributes =
        grid[row][col].attributes || DEFAULT_CELL_ATTRIBUTES;
      const textStyle = curCellAttributes?.[CellAttribute.TextStyle] || "";
      value = getUpdatedTextStyle(textStyle, value);
      if (curCellAttributes[CellAttribute.Class]) {
        this.handleSelectionAttributeChange(CellAttribute.Class, undefined);
      }
    }

    const { start, end } = rectToSelection(selectionToRect(this.state.sheetSelection));

    const changes: SheetUnawareCellAttributeUpdate[] = [];

    for (let i = start.row; i <= end.row; i++) {
      for (let j = start.col; j <= end.col; j++) {
        changes.push({ cellId: [j, i], attribute: name, value });
      }
    }
    this.handleCellAttributeChange(changes);
  };

  handleClearCells = () => {
    if (hasSelectionProtectedCells(this.state.grid, this.state.sheetSelection)) {
      this.setState({ didEditProtectedCells: true });
      return;
    }
    CLEARABLE_ATTRIBUTES.forEach((attributeName) =>
      this.handleSelectionAttributeChange(attributeName, undefined)
    );
  };

  handleIncreaseFontSize = () => this.handleChangeFontSize(FONT_SIZE_STEP);

  handleDecreaseFontSize = () => this.handleChangeFontSize(-FONT_SIZE_STEP);

  handleChangeFontSize = (delta: number) => {
    const { row, col } = this.state.activeSheetCellId;
    const currentFontSize = parseInt(
      this.state.grid[row][col].attributes?.[CellAttribute.FontSize] ||
        DEFAULT_FONT_SIZE.toString()
    );
    this.handleSelectionAttributeChange(
      CellAttribute.FontSize,
      (currentFontSize + delta).toString()
    );
  };

  handleSelectionClear = (selection?: SheetSelection) => {
    const { sheetSelection } = this.state;
    const clearSelection = selection ?? sheetSelection;

    this.handleCellValuesUpdate(
      getSelectionClearChangesWithAttributes(this.state.grid, clearSelection)
    );
  };

  handleUpdateCellBorders = (cellAttribute: CellAttribute, attributeValue: string) => {
    handleCellBorders({
      grid: this.state.grid,
      cellAttribute,
      attributeValue,
      sheetSelection: this.state.sheetSelection,
      onCellAttributeChange: this.handleCellAttributeChange,
    });
  };

  handleOpenHyperlink = () => {
    const { grid, sheetSelection } = this.state;
    const { left, top } = selectionToRect(sheetSelection);
    const cell = grid[top][left];
    const link = cell.attributes?.[CellAttribute.Link];
    if (link) {
      window.open(link, "_blank")?.focus();
    }
  };

  handleExecutionPolicyValueChange = (newValue: number) => {
    const { row, col } = this.state.activeSheetCellId;
    this.handleCellAttributeChange([
      {
        cellId: [col, row],
        attribute: CellAttribute.ExecutionPolicy,
        value: "" + newValue,
      },
    ]);
  };

  sumSelection = (grid: GridElement[][], sheetSelection: SheetSelection) => {
    const { start, end } = rectToSelection(selectionToRect(sheetSelection));
    if (start.row === end.row && start.col === end.col) {
      return null;
    }
    let sum = 0;
    for (let i = start.row; i <= end.row; i++) {
      for (let j = start.col; j <= end.col; j++) {
        const cell = grid[i][j];
        const value = cell.value;
        if (value && isNumberValue(value)) {
          sum += typeof value === "string" ? parseFloat(value) : value;
        }
      }
    }
    return sum;
  };

  handleCopyFormat = (selection: SheetSelection) => {
    if (!this.state.copyFormatSource) {
      return;
    }
    let { top, bottom, left, right } = selectionToRect(selection);
    const sourceRect = selectionToRect(this.state.copyFormatSource);
    if (bottom - top < sourceRect.bottom - sourceRect.top) {
      bottom = top + sourceRect.bottom - sourceRect.top;
    }
    if (right - left < sourceRect.right - sourceRect.left) {
      right = left + sourceRect.right - sourceRect.left;
    }
    const changes: SheetUnawareCellAttributeUpdate[] = _.range(top, bottom + 1).flatMap(
      (rowIdx, selectionRowIdx) =>
        _.range(left, right + 1).flatMap((colIdx, selectionColIdx) =>
          COPYABLE_ATTRIBUTES.map((attribute) => ({
            cellId: [colIdx, rowIdx],
            attribute,
            value:
              this.state.grid[
                sourceRect.top +
                  (selectionRowIdx % (sourceRect.bottom - sourceRect.top + 1))
              ][
                sourceRect.left +
                  (selectionColIdx % (sourceRect.right - sourceRect.left + 1))
              ].attributes?.[attribute],
          }))
        )
    );
    this.handleCellAttributeChange(changes);
    this.setState({ copyFormatSource: undefined });
  };

  handleCopyFormatToggle = () => {
    this.setState(({ copyFormatSource, sheetSelection }) => ({
      copyFormatSource: copyFormatSource ? undefined : { ...sheetSelection },
    }));
  };

  setSecrets = (user: Secrets, tyne: Secrets) => {
    this.kernelSession.setSecrets(user, tyne);
  };

  renderSheetPickerMenu = memoizeOne(
    (
      sheets: Sheet[],
      sheetsOrder: number[],
      currentSheet: number,
      setSheet: (sheetId: number, sheets?: Sheet[]) => void,
      handleSheetsReorder: (sheetsOrder: number[]) => void,
      createNewSheet: () => void,
      deleteSheet: (id: number) => void,
      renameSheet: (id: number, name: string) => void,
      sheetMenuRef: React.Ref<SheetsMenuApi> | undefined
    ) => (
      <HardReloadSheetMenu
        sheets={sheets}
        sheetsOrder={sheetsOrder}
        activeSheetId={currentSheet}
        onSheetClick={setSheet}
        onSheetsReorder={handleSheetsReorder}
        onAddSheet={createNewSheet}
        onDeleteSheet={deleteSheet}
        onRenameSheet={renameSheet}
        ref={sheetMenuRef}
      />
    )
  );

  renderFooter = (sumOfSelection: number | null) => (
    <div style={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
      {!this.state.appModeRestricted &&
        this.renderSheetPickerMenu(
          this.state.sheets,
          this.state.sheetsOrder,
          this.state.currentSheet,
          this.setSheet,
          this.handleSheetsReorder,
          this.createNewSheet,
          this.deleteSheet,
          this.renameSheet,
          this.sheetMenuRef
        )}
      <div style={{ display: "flex", marginLeft: "auto" }}></div>
      {sumOfSelection !== null && (
        <div style={{ display: "flex", marginRight: 15 }}>Sum: {sumOfSelection}</div>
      )}
    </div>
  );

  showAdvancedFeaturesAuthorizationModal = () => {
    const { inGSMode } = getGSheetAppConfig();
    if (inGSMode) {
      this.setState({ showAdvancedFeaturesAuthorizationModal: true });
    }
  };
}

export default observer(NeptyneContainer);
