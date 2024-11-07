import { UndoRedoQueue } from "./UndoRedo";
import { KernelMessage } from "@jupyterlab/services";
import { v4 as uuid } from "uuid";
import { SheetSelection } from "./SheetUtils";

test("Can do or redo", () => {
  let messagesSend = 0;
  const sendUndoRedo = (msg: KernelMessage.IShellMessage) => {
    messagesSend++;
  };
  let lastSelection: SheetSelection | null = null;
  const applySelection = (selection: SheetSelection) => {
    lastSelection = selection;
  };
  const udrd = new UndoRedoQueue(sendUndoRedo, applySelection);
  expect(udrd.canRedo()).toBe(false);
  expect(udrd.canUndo()).toBe(false);

  const selection = { start: { row: 0, col: 0 }, end: { row: 1, col: 1 } };

  const msg = {
    header: {
      date: "",
      msg_id: uuid(),
      username: "username",
      session: "?",
      msg_type: "execute_request",
      version: "5.2",
    },
    metadata: {},
    content: {},
    buffers: [],
    parent_header: {},
    channel: "shell",
  } as KernelMessage.IShellMessage;
  udrd.prepareUndo(msg, selection);
  udrd.undoMsgReceived(msg);
  udrd.prepareUndo(msg, selection);
  udrd.undoMsgReceived(msg);

  expect(udrd.canRedo()).toBe(false);
  expect(udrd.canUndo()).toBe(true);

  udrd.undo();
  expect(udrd.canRedo()).toBe(true);
  expect(udrd.canUndo()).toBe(true);
  expect(lastSelection).toEqual(selection);
  expect(messagesSend).toBe(1);

  udrd.undo();
  expect(udrd.canRedo()).toBe(true);
  expect(udrd.canUndo()).toBe(false);
  expect(lastSelection).toEqual(selection);

  expect(messagesSend).toBe(2);
  udrd.redo();
  expect(messagesSend).toBe(3);
  expect(udrd.canRedo()).toBe(true);
  expect(udrd.canUndo()).toBe(true);
});
