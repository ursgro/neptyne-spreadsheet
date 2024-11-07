import { v4 as uuid } from "uuid";
import { Error, Output } from "./Notebook";
import {
  Kernel as KernelNamespace,
  KernelMessage,
  ServerConnection,
} from "@jupyterlab/services";
import { CellType, SheetLocation } from "./SheetUtils";
import { KernelConnection } from "@jupyterlab/services/lib/kernel/default";
import {
  CallServerContent,
  CellAttributesUpdate,
  CellId,
  CopyCellsContent,
  DeleteSheetContent,
  DownloadRequest,
  InsertDeleteContent,
  InsertDeleteReply,
  InstallRequirementsContent,
  KernelInitState,
  MessageTypes,
  NavigateToContent,
  RenameSheetContent,
  RenameTyneContent,
  RerunCellsContent,
  RunCellsContent,
  Secrets,
  SheetAttributeUpdate,
  SheetAutofillContent,
  SheetCellId,
  SheetUpdateContent,
  SubscribersUpdatedContent,
  TyneEvent,
  TynePropertyUpdateContent,
  WidgetGetStateContent,
  WidgetRegistry,
  WidgetValidateParamsContent,
  WidgetValueContent,
} from "./NeptyneProtocol";
import { JSONObject } from "@lumino/coreutils";
import { AutocompleteResponse } from "./notebook/NotebookCellEditor/types";
import {
  RemoteSheet,
  RemoteSheetCell,
  RemoteTyne,
} from "./neptyne-container/NeptyneContainer";
import { NBCell } from "./notebook/NeptyneNotebook";
import { getGSheetAppConfig } from "./gsheet_app_config";
import { StreamlitAppConfig } from "./NeptyneProtocol";
import { User } from "./user-context";

const KERNEL_CONNECT_TIMEOUT = 30_000;

export interface Kernel {
  name: string;
  id: string | null;
  connections?: number;
  last_activity?: Date;
  execution_state?: string;
}

export interface SessionInfo {
  path: string;
  type: string;
  name: string;
  kernel: Kernel;
  notebook?: Notebook;
  id?: string;
}

export interface Notebook {
  path: string;
  name: string;
}

export interface MsgHeader {
  date: string;
  msg_id: string;
  username: string;
  session: string;
  msg_type: string;
  version: string;
}

export interface Content {}

interface MethodCompletionResponse {
  metadata: {
    _jupyter_types_experimental: { text: string; type: string; docstring?: string }[];
  };
}

interface GlobalCompletionResponse {
  result: [label: string, detail: string, args: string[]][];
}

export type AvailableFunction = [string, string];

type ExecutionStatus = KernelNamespace.Status | "init_failed";

const EMPTY_CONTENT = {
  silent: false,
  store_history: false,
  user_expressions: {},
  allow_stdin: true,
  stop_on_error: true,
};

export type StreamHandler = (error: boolean, text: string, final: boolean) => void;

interface ExtendedHeader extends KernelMessage.IHeader {
  [key: string]: any;
}

interface ExtendedMsg extends KernelMessage.IMessage {
  parent_header: ExtendedHeader;
  header: ExtendedHeader;
}

export type KernelStatus = KernelNamespace.Status | KernelInitState | "shutdown";

const logTimings = (msg: ExtendedMsg) => {
  const msgDate = new Date(msg.header.date).getTime();
  const parentDate = new Date(msg.parent_header.date).getTime();
  const replyAt = new Date(msg.header.server_reply_at).getTime();
  const now = new Date().getTime();
  const parentMsgType = msg.parent_header?.msg_type || "[no parent]";
  console.debug(
    `${parentMsgType} -> ${msg.header.msg_type}:
      client/server latency ${now - replyAt}ms
      client/kernel latency ${now - msgDate}ms
      server time ${msg.header.server_duration * 1000}ms
      wall time ${parentDate !== null ? now - parentDate : "??"}ms`
  );
};

function remoteCellsForSheetUpdate(msg: KernelMessage.IMessage) {
  return (msg.content as SheetUpdateContent).cellUpdates as RemoteSheetCell[];
}

export function processCondensedMessages(
  queue: KernelMessage.IMessage[],
  processMessage: (msg: KernelMessage.IMessage) => void
) {
  const cellKey = (cell: RemoteSheetCell) => {
    const cellId = "cellId" in cell ? cell.cellId : cell[0];
    return "" + cellId;
  };

  let prevSheetUpdate: KernelMessage.IMessage | undefined = undefined;
  for (const msg of queue) {
    const msgType: string = msg.header.msg_type;
    if (msgType === MessageTypes.SheetUpdate) {
      if (prevSheetUpdate) {
        const prevContent = remoteCellsForSheetUpdate(prevSheetUpdate);
        const thisContent = remoteCellsForSheetUpdate(msg);
        const cellIds = new Set<CellId>();
        for (const cell of thisContent) {
          cellIds.add(cellKey(cell));
        }
        (msg.content as SheetUpdateContent).cellUpdates = prevContent
          .filter((cell) => !cellIds.has(cellKey(cell)))
          .concat(thisContent);
      }
      prevSheetUpdate = msg;
    } else {
      if (prevSheetUpdate) {
        processMessage(prevSheetUpdate);
        prevSheetUpdate = undefined;
      }
      processMessage(msg);
    }
  }
  if (prevSheetUpdate) {
    processMessage(prevSheetUpdate);
  }
}

export interface NeptyneMetadata {
  streamlit: StreamlitAppConfig | {};
  initialized: boolean;
}

export class KernelSession {
  sessionId?: string;
  sheetId?: string;
  rpcCallbacks: { [msgId: string]: (result: any) => void } = {};
  streamCallbacks: { [msgId: string]: StreamHandler } = {};

  kernel?: KernelNamespace.IKernelConnection;
  connecting: boolean = false;

  // event handlers:
  statusHandler?: (status: KernelStatus) => void;
  executeInputHandler?: (
    cellId: string,
    cell: NBCell,
    changedLineNumbers?: number[]
  ) => void;
  executeReplyHandler?: (
    cellId: string | undefined,
    cell: NBCell | undefined,
    metadata: NeptyneMetadata | undefined
  ) => void;
  acknowledgeRunCellsHandler?: (cell: NBCell) => void;
  rerunCellsHandler?: (changedFunctions: string[]) => void;
  processKernelReply?: (
    cellId: string,
    output: Output,
    msg: KernelMessage.IMessage
  ) => void;
  procesServerError?: (error: Error) => void;
  showAlert?: (msg: string) => void;
  confetti?: (duration: number) => void;
  processStreamMessage?: (
    cellId: string | undefined,
    msg: KernelMessage.IStreamMsg
  ) => void;
  serverCallBack?: (method: string, result: any) => void;
  processCellUpdateMessage?: (cells: RemoteSheetCell[]) => void;
  processInsertDeleteReply?: (
    insertDeleteReply: InsertDeleteReply<RemoteSheetCell>
  ) => void;
  processSheetAttributeUpdate?: (update: SheetAttributeUpdate) => void;
  processInputRequest?: (msg: KernelMessage.IInputRequestMsg) => void;
  handleDownload?: (downloadRequest: DownloadRequest) => void;
  processFileUploadRequest?: (prompt?: string, accept?: string) => void;
  processCreateSheet?: (msg: RemoteSheet, selfReply: boolean) => void;
  processRenameSheet?: (msg: RenameSheetContent) => void;
  processDeleteSheet?: (msg: DeleteSheetContent) => void;
  processSubscribersUpdated?: (msg: SubscribersUpdatedContent) => void;
  processRequirementsUpdate?: (msg: InstallRequirementsContent) => void;
  processNavigateTo?: (msg: NavigateToContent) => void;
  processPropertyUpdate?: (msg: TynePropertyUpdateContent) => void;
  processEventLog?: (msg: TyneEvent) => void;
  commOpenHandler?: (cellId: string, commOpen: KernelMessage.ICommOpenMsg) => void;
  widgetStateUpdated?: (cellId: string, newState: { [key: string]: string }) => void;
  undoMsgReceived?: (msg: KernelMessage.IShellMessage) => void;
  processTyneRename?: (name: string) => void;

  reloadKernelState?: (remoteTyne: RemoteTyne) => void;
  onSaved?: (when: Date | null) => void;
  onShowApiQuotaWarning?: (service: string) => void;

  sendShellMessage(
    msgType: string,
    content: any,
    metadata: JSONObject,
    operationId?: string
  ): KernelMessage.IShellMessage {
    const msg = {
      header: {
        date: new Date().toISOString(),
        msg_id: uuid(),
        operation_id: operationId ?? uuid(),
        username: "username",
        session: this.sessionId!,
        msg_type: msgType,
        version: "5.2",
      },
      metadata: metadata,
      content: content,
      buffers: [],
      parent_header: {},
      channel: "shell",
    } as KernelMessage.IShellMessage;

    this.kernel?.sendShellMessage(msg, false);

    return msg;
  }

  async connect(user: User, tyneId: string, shardId: number) {
    if (this.connecting) {
      return;
    }
    this.connecting = true;
    this.sheetId = tyneId;
    const { serverUrlBase, projectId } = getGSheetAppConfig();
    const location = serverUrlBase ? new URL(serverUrlBase) : window.location;
    const host = location.host;
    const protocol = location.protocol.startsWith("https") ? "wss" : "ws";
    this.sessionId = uuid();

    const settings = {
      ...ServerConnection.makeSettings({
        baseUrl: "",
        appUrl: "",
        wsUrl: `${protocol}:/${host}/ws/${shardId}`,
      }),
    };

    const kernelOptions = {
      model: {
        id: tyneId,
        name: "",
      },
      handleComms: true,
      serverSettings: settings,
      clientId: "",
    };
    if (this.kernel) {
      this.kernel.dispose();
    }
    this.kernel = new KernelConnection(kernelOptions);

    this.kernel.statusChanged.connect((kernel, status) => {
      // Idle and busy we handle in anyMessage where we look at what caused it:
      if (status !== "busy" && status !== "idle") {
        this.updateStatus(status);
      }
    });

    const thisOne = this;
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(`The connection timed out. Status: ${this.kernel?.status}`); // this is a no-op if we resolve first
      }, KERNEL_CONNECT_TIMEOUT);
      this.kernel!.anyMessage.connect((kernel, { msg, direction }) => {
        if (direction === "recv") {
          logTimings(msg as ExtendedMsg);
          if ((msg.header.msg_type as string) === MessageTypes.AuthRequired) {
            const { authToken } = getGSheetAppConfig();
            user.getIdToken().then((token) => {
              this.sendShellMessage(
                MessageTypes.AuthReply,
                {
                  token,
                  projectId: projectId,
                  gsheetAuthToken: authToken,
                },
                {}
              );
              clearTimeout(timeout);
              resolve();
            });
          } else {
            this.getOnmessage(msg);
          }
        }
      });
    }).then(() => {
      thisOne.connecting = false;
    });
  }

  queue: KernelMessage.IMessage[] = [];
  timeoutId: number | undefined = undefined;

  private getOnmessage(msg: KernelMessage.IMessage) {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    this.queue.push(msg);
    this.timeoutId = setTimeout(() => {
      this.timeoutId = undefined;
      try {
        if (this.queue.length > 1) {
          processCondensedMessages(this.queue, this.processMessage.bind(this));
        } else {
          this.processMessage(this.queue[0]);
        }
      } finally {
        this.queue = [];
      }
    });
  }

  private processMessage(msg: KernelMessage.IMessage) {
    const msgType: string = msg.header.msg_type;

    const cellId = msg.metadata["cellId"] as string | undefined;

    if (KernelMessage.isStatusMsg(msg)) {
      const state = msg.content.execution_state as ExecutionStatus;
      const parentHeader = msg.parent_header;
      if (state === "init_failed") {
        // The server failed to initialize the kernel, and we should not retry
        this.updateStatus("dead");
        this.kernel?.dispose();
        return;
      } else if (
        "msg_type" in parentHeader &&
        parentHeader.msg_type === "shutdown_request"
      ) {
        this.updateStatus("shutdown");
        this.kernel?.dispose();
        return;
      } else if (state === "busy") {
        const reason = (msg.parent_header as ExtendedHeader).init_phase;
        if (reason && Object.values(KernelInitState).includes(reason)) {
          this.updateStatus(reason);
          return;
        }
      } else if (
        state === "idle" &&
        "msg_id" in msg.parent_header &&
        this.streamCallbacks[msg.parent_header.msg_id]
      ) {
        this.streamCallbacks[msg.parent_header.msg_id](false, "", true);
        delete this.streamCallbacks[msg.parent_header.msg_id];
      }
      // Don't show activity triggered by RPC's - the user doesn't expect this and it interrupts our flow:
      if ((msg.parent_header as any).orgMsgType !== MessageTypes.RpcRequest) {
        this.updateStatus(state);
      }
    } else if (KernelMessage.isExecuteInputMsg(msg)) {
      if (this.executeInputHandler && cellId) {
        const cell = (msg.content as any)["cell"] as NBCell;
        const changedLineNumbers = (msg.parent_header as any)[
          "changed_line_numbers"
        ] as number[] | undefined;
        this.executeInputHandler(cellId, cell, changedLineNumbers);
      }
    } else if (KernelMessage.isExecuteReplyMsg(msg)) {
      if (this.executeReplyHandler) {
        let cell;
        if (cellId) {
          const executionTime =
            "server_duration" in (msg.header as ExtendedHeader)
              ? (msg.header as ExtendedHeader).server_duration
              : null;
          cell = { ...((msg.content as any)["cell"] as NBCell), executionTime };
        }
        const metadata = msg.metadata["neptyne"];
        this.executeReplyHandler(cellId, cell, metadata as any);
      }
    } else if (msgType === MessageTypes.AckRunCells) {
      this.acknowledgeRunCellsHandler?.(msg.content as NBCell);
    } else if (msgType === MessageTypes.RerunCells) {
      if (this.rerunCellsHandler) {
        this.rerunCellsHandler((msg.content as RerunCellsContent).changedFunctions);
      }
    } else if (msgType === "complete_reply") {
      const content = msg.content;
      if (
        "msg_id" in msg.parent_header &&
        this.rpcCallbacks[msg.parent_header.msg_id]
      ) {
        this.rpcCallbacks[msg.parent_header.msg_id](content);
        delete this.rpcCallbacks[msg.parent_header.msg_id];
      }
    } else if (KernelMessage.isCommOpenMsg(msg)) {
      if (cellId && this.commOpenHandler) {
        this.commOpenHandler(cellId, msg);
      }
    } else if (msgType === MessageTypes.RpcResult) {
      const content = msg.content as any;
      if (this.serverCallBack) {
        this.serverCallBack(content["method"], content["result"]);
      }
      if (
        "msg_id" in msg.parent_header &&
        this.rpcCallbacks[msg.parent_header.msg_id]
      ) {
        this.rpcCallbacks[msg.parent_header.msg_id](content);
        delete this.rpcCallbacks[msg.parent_header.msg_id];
      }
    } else if (msgType === MessageTypes.SheetUpdate) {
      if (this.processCellUpdateMessage) {
        this.processCellUpdateMessage((msg.content as SheetUpdateContent).cellUpdates);
      }
    } else if (msgType === MessageTypes.InsertDeleteCellsReply) {
      if (this.processInsertDeleteReply) {
        this.processInsertDeleteReply(
          msg.content as InsertDeleteReply<RemoteSheetCell>
        );
      }
    } else if (msgType === MessageTypes.ChangeSheetAttributeReply) {
      if (this.processSheetAttributeUpdate) {
        this.processSheetAttributeUpdate(msg.content as SheetAttributeUpdate);
      }
    } else if (KernelMessage.isStreamMsg(msg)) {
      if (cellId && this.processStreamMessage) {
        this.processStreamMessage(cellId, msg);
      }
      if (
        "msg_id" in msg.parent_header &&
        this.streamCallbacks[msg.parent_header.msg_id]
      ) {
        this.streamCallbacks[msg.parent_header.msg_id](
          msg.content.name === "stderr",
          msg.content.text,
          false
        );
      }
    } else if (msgType === MessageTypes.ShowAlert) {
      if (this.showAlert) {
        this.showAlert((msg.content as any).msg);
      }
    } else if (msgType === MessageTypes.Confetti) {
      if (this.confetti) {
        this.confetti((msg.content as any).duration);
      }
    } else if (
      KernelMessage.isExecuteResultMsg(msg) ||
      KernelMessage.isDisplayDataMsg(msg) ||
      KernelMessage.isErrorMsg(msg)
    ) {
      if (cellId && this.processKernelReply) {
        const output = { ...msg.content, output_type: msgType } as Output;
        this.processKernelReply(cellId, output, msg);
      } else if (KernelMessage.isErrorMsg(msg) && !cellId && this.procesServerError) {
        const error = { ...msg.content, output_type: msgType } as Error;
        this.procesServerError(error);
      }
    } else if (KernelMessage.isInputRequestMsg(msg)) {
      if (this.processInputRequest) {
        this.processInputRequest(msg);
      }
    } else if (msgType === MessageTypes.StartDownload) {
      if (this.handleDownload) {
        this.handleDownload(msg.content as DownloadRequest);
      }
    } else if (msgType === MessageTypes.UploadFile) {
      if (this.processFileUploadRequest) {
        const customContent = (msg.parent_header as any).neptyne_msg_content || {};
        const prompt: string | undefined = customContent.prompt;
        const accept: string | undefined = customContent.accept;
        this.processFileUploadRequest(prompt, accept);
      }
    } else if (msgType === MessageTypes.CreateSheet) {
      if (this.processCreateSheet) {
        this.processCreateSheet(
          msg.content as RemoteSheet,
          msg.parent_header.hasOwnProperty("undo")
        );
      }
    } else if (msgType === MessageTypes.SubscribersUpdated) {
      if (this.processSubscribersUpdated) {
        this.processSubscribersUpdated(msg.content as SubscribersUpdatedContent);
      }
    } else if (msgType === MessageTypes.DeleteSheet) {
      if (this.processDeleteSheet) {
        this.processDeleteSheet(msg.content as DeleteSheetContent);
      }
    } else if (msgType === MessageTypes.RenameSheet) {
      if (this.processRenameSheet) {
        this.processRenameSheet(msg.content as RenameSheetContent);
      }
    } else if (msgType === MessageTypes.InstallRequirements) {
      if (this.processRequirementsUpdate) {
        this.processRequirementsUpdate(msg.content as InstallRequirementsContent);
      }
    } else if (msgType === MessageTypes.NavigateTo) {
      if (this.processNavigateTo) {
        this.processNavigateTo(msg.content as NavigateToContent);
      }
    } else if (msgType === MessageTypes.TynePropertyUpdate) {
      if (this.processPropertyUpdate) {
        this.processPropertyUpdate(msg.content as TynePropertyUpdateContent);
      }
    } else if (msgType === MessageTypes.LogEvent) {
      if (this.processEventLog) {
        this.processEventLog(msg.content as TyneEvent);
      }
    } else if (msgType === MessageTypes.RenameTyne) {
      if (this.processTyneRename) {
        this.processTyneRename((msg.content as RenameTyneContent).name);
      }
    } else if (msgType === MessageTypes.SaveKernelState) {
      if (this.reloadKernelState) {
        this.reloadKernelState(msg.content as RemoteTyne);
      }
    } else if (msgType === MessageTypes.TyneSaving) {
      if (this.onSaved) {
        this.onSaved(null);
      }
    } else if (msgType === MessageTypes.TyneSaved) {
      if (this.onSaved) {
        this.onSaved(new Date());
      }
    } else if (msgType === MessageTypes.ApiQuotaExceeded) {
      if (this.onShowApiQuotaWarning) {
        this.onShowApiQuotaWarning((msg.content as any).service);
      }
    } else if (msgType === "kernel_info_reply" || msgType === "comm_info_reply") {
      // ignore
    } else {
      console.log("unhandled message of type", msgType);
    }

    if (this.undoMsgReceived) {
      const undoMsg = (msg.metadata as any)?.undo;
      if (undoMsg) {
        this.undoMsgReceived(undoMsg);
      }
    }
  }

  metaData(cellId?: string | SheetCellId, other?: JSONObject) {
    if (other === undefined) {
      other = {};
    }
    if (cellId) {
      other = { ...other, cellId };
    }
    return { ...other, sheetId: this.sheetId || "" };
  }

  runCells(contents: Omit<RunCellsContent, "gsMode">, operationId?: string) {
    const content = {
      ...EMPTY_CONTENT,
      ...contents,
      gsMode: getGSheetAppConfig().inGSMode,
    };
    return this.sendShellMessage(MessageTypes.RunCells, content, {}, operationId);
  }

  callServerMethod<T = any>(
    method: string,
    args: string[],
    kwargs: { [param: string]: any }
  ) {
    const callServerContent: CallServerContent = { method, args, kwargs };
    const content = {
      ...EMPTY_CONTENT,
      ...callServerContent,
    };
    const msg = this.sendShellMessage(MessageTypes.RpcRequest, content, {});
    const that = this;
    return new Promise<T>(function (resolve, reject) {
      that.rpcCallbacks[msg.header.msg_id] = resolve;
    });
  }

  callTyneMethod<T = any>(messageType: MessageTypes, content: any) {
    const msg = this.sendShellMessage(messageType, content, {});
    const that = this;
    return new Promise<T>(function (resolve, reject) {
      that.rpcCallbacks[msg.header.msg_id] = resolve;
    });
  }

  saveCell(cellId: string, contents: string, cellType: CellType, isInitCell: boolean) {
    const content = {
      ...EMPTY_CONTENT,
      code: contents,
    };
    return this.sendShellMessage(
      MessageTypes.SaveCell,
      content,
      this.metaData(cellId, { cellType, isInitCell })
    );
  }

  insertDeleteCells(contents: InsertDeleteContent) {
    const content = {
      ...EMPTY_CONTENT,
      ...contents,
    };
    return this.sendShellMessage(
      MessageTypes.InsertDeleteCells,
      content,
      this.metaData()
    );
  }

  changeCellAttribute(update: CellAttributesUpdate, operationId?: string) {
    const content = {
      ...EMPTY_CONTENT,
      ...update,
    };
    return this.sendShellMessage(
      MessageTypes.ChangeCellAttribute,
      content,
      this.metaData(""),
      operationId
    );
  }

  updateTyneProperty(update: TynePropertyUpdateContent) {
    const content = {
      ...EMPTY_CONTENT,
      ...update,
    };
    return this.sendShellMessage(
      MessageTypes.TynePropertyUpdate,
      content,
      this.metaData("")
    );
  }

  changeSheetAttribute(update: SheetAttributeUpdate) {
    const content = {
      ...EMPTY_CONTENT,
      ...update,
    };
    return this.sendShellMessage(
      MessageTypes.ChangeSheetAttribute,
      content,
      this.metaData("")
    );
  }

  propertyAutocomplete(
    cellId: { col: number; row: number },
    sheetId: number,
    codeFragment: string,
    charIndex: number
  ): Promise<AutocompleteResponse> {
    const content = {
      code: codeFragment,
      cursor_pos: charIndex,
    };
    const msg = this.sendShellMessage(
      "complete_request",
      content,
      this.metaData([cellId.col, cellId.row, sheetId])
    );
    const that = this;
    return new Promise<MethodCompletionResponse>(function (resolve, reject) {
      that.rpcCallbacks[msg.header.msg_id] = resolve;
    }).then(({ metadata }) => ({
      result: metadata._jupyter_types_experimental.map(({ text, type, docstring }) => ({
        label: text,
        type: type === "function" ? "function" : "constant",
        detail: docstring,
        args: [],
      })),
    }));
  }

  globalAutocomplete(
    expression: string,
    config?: Record<string, any>
  ): Promise<AutocompleteResponse> {
    return this.callServerMethod<GlobalCompletionResponse>("available_functions", [], {
      prefix: expression,
      ...config,
    }).then(({ result }) => ({
      result: result.map(([label, detail, args]) => ({
        label,
        detail,
        type: "function",
        args: args.map((arg) => ({ name: arg })),
      })),
    }));
  }

  sheetCopy(sheetCopycontent: CopyCellsContent, operationId?: string) {
    const content = {
      ...EMPTY_CONTENT,
      ...sheetCopycontent,
    };
    return this.sendShellMessage(MessageTypes.CopyCells, content, {}, operationId);
  }

  sheetAutofill(sheetAutofillContent: SheetAutofillContent) {
    const content = {
      ...EMPTY_CONTENT,
      ...sheetAutofillContent,
    };
    return this.sendShellMessage(MessageTypes.SheetAutofill, content, {});
  }

  widgetDidSendData(cellId: string, data: any) {
    const method = data.method;
    if (method === "update") {
      if (this.widgetStateUpdated && data.state) {
        this.widgetStateUpdated(cellId, data.state);
      }
    }
  }

  requestCommInfo(content: KernelMessage.ICommInfoRequestMsg["content"]) {
    return this.kernel!.requestCommInfo(content);
  }

  private updateStatus(status: KernelStatus) {
    if (this.statusHandler) {
      this.statusHandler(status);
    }
  }

  sendUndoRedo(msg: KernelMessage.IShellMessage) {
    const headerWithId = { ...msg.header, msg_id: uuid() };
    const msgWithNewId = { ...msg, header: headerWithId };
    this.kernel?.sendShellMessage(msgWithNewId, false);
  }

  widgetValueChanged(widgetValueContent: WidgetValueContent) {
    const content = {
      ...EMPTY_CONTENT,
      ...widgetValueContent,
    };
    return this.sendShellMessage(MessageTypes.WidgetValueUpdate, content, {});
  }

  getWidgetRegistry = (): Promise<WidgetRegistry> => {
    return this.callServerMethod<any>("widget_registry", [], {}).then((result) => {
      return result.result;
    });
  };

  getWidgetState = (
    location: SheetLocation,
    currentSheet: number
  ): Promise<{ [key: string]: any }> => {
    const cellId: SheetCellId = [location.col, location.row, currentSheet];
    const content: WidgetGetStateContent = { cellId };

    return this.callTyneMethod(MessageTypes.WidgetGetState, content).then((result) => {
      return result.result;
    });
  };

  validateWidgetParams = (
    params: { [key: string]: string },
    code: string
  ): Promise<{ [key: string]: string }> => {
    const content: WidgetValidateParamsContent = { code, params };

    return this.callTyneMethod(MessageTypes.WidgetValidateParams, content).then(
      (result) => {
        return result.result;
      }
    );
  };

  inputReply(value: string) {
    this.kernel?.sendInputReply({ value, status: "ok" });
  }

  setSecret(key: string, value: string) {
    this.sendShellMessage(MessageTypes.SetSecret, { key, value }, {});
  }

  setSecrets(user: Secrets, tyne: Secrets) {
    this.sendShellMessage(MessageTypes.SetSecrets, { user, tyne }, {});
  }

  installRequirements(requirements: string, onStream: StreamHandler) {
    const msg = this.sendShellMessage(
      MessageTypes.InstallRequirements,
      { requirements },
      {}
    );
    this.streamCallbacks[msg.header.msg_id] = onStream;
  }

  createNewSheet() {
    this.sendShellMessage(
      MessageTypes.CreateSheet,
      {},
      { clientSessionId: this.sessionId! }
    );
  }

  deleteSheet(sheetId: number) {
    this.sendShellMessage(MessageTypes.DeleteSheet, { sheetId }, {});
  }

  renameSheet(sheetId: number, name: string) {
    this.sendShellMessage(MessageTypes.RenameSheet, { sheetId, name }, {});
  }

  interrupt() {
    this.sendShellMessage(MessageTypes.InterruptKernel, {}, {});
  }

  renameTyne(name: string) {
    this.sendShellMessage(MessageTypes.RenameTyne, { name }, {});
  }

  save() {
    this.sendShellMessage(MessageTypes.SaveTyne, {}, {});
  }

  ping() {
    this.sendShellMessage(MessageTypes.Ping, {}, {});
  }

  reconnect(name: string) {
    this.sendShellMessage(MessageTypes.ReconnectKernel, { name }, {});
  }
}

export const getKernelSession = () => new KernelSession();
