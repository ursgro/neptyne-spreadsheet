import { KernelMessage } from "@jupyterlab/services";
import { SheetSelection } from "./SheetUtils";

// Consider grouping queue elements by operationId to simplify undo/redo.
interface UndoRedo {
  undo: KernelMessage.IShellMessage | null;
  redo: KernelMessage.IShellMessage;
  selection: SheetSelection;
}

export class UndoRedoQueue {
  sendUndoRedo: (msg: KernelMessage.IShellMessage) => void;
  queue: UndoRedo[];
  index: number;
  applyCurrentSelection: () => void;

  constructor(
    sendUndoRedo: (msg: KernelMessage.IShellMessage) => void,
    applySelection: (selection: SheetSelection) => void
  ) {
    this.sendUndoRedo = sendUndoRedo;
    this.applyCurrentSelection = () => {
      applySelection(this.queue[this.index].selection);
    };
    this.queue = [];
    this.index = -1;
  }

  undoMsgReceived(msg: KernelMessage.IShellMessage) {
    for (let pending of this.queue) {
      // The server just returns the undo message with changed content, but the same message id:
      if (pending.undo === null && pending.redo.header.msg_id === msg.header.msg_id) {
        pending.undo = msg;
        break;
      }
    }
  }

  canUndo = () => {
    return this.index >= 0;
  };

  canRedo = () => {
    return this.index < this.queue.length - 1;
  };

  prepareUndo(msg: KernelMessage.IShellMessage, selection: SheetSelection) {
    this.index++;
    this.queue[this.index] = {
      undo: null,
      redo: msg,
      selection,
    };
    this.queue = this.queue.slice(0, this.index + 1);
  }

  undo = () => {
    if (!this.canUndo()) return;
    let msg = this.queue[this.index].undo;
    if (!msg) return;
    // @ts-ignore
    const originalOperationId = msg.header.operation_id;
    let operationId;
    do {
      this.sendUndoRedo(msg);
      this.applyCurrentSelection();
      this.index--;

      if (!this.canUndo()) return;
      msg = this.queue[this.index].undo;
      if (!msg) return;
      // @ts-ignore
      operationId = msg.header.operation_id;
    } while (!!originalOperationId && operationId === originalOperationId);
  };

  redo = () => {
    if (!this.canRedo()) return;
    this.index++;
    let msg = this.queue[this.index].redo;
    if (!msg) return;
    const originalOperationId = (msg.header as any).operation_id;
    let operationId;
    while (true) {
      this.sendUndoRedo(msg);
      this.applyCurrentSelection();

      if (!this.canRedo()) return;
      msg = this.queue[this.index + 1].redo;
      if (!msg) return;
      // @ts-ignore
      operationId = msg.header.operation_id;
      if (!originalOperationId || operationId !== originalOperationId) return;
      this.index++;
    }
  };
}
