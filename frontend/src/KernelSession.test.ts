import { KernelMessage } from "@jupyterlab/services";
import { processCondensedMessages } from "./KernelSession";
import { JSONObject } from "@lumino/coreutils";
import { v4 as uuid } from "uuid";
import { MessageTypes } from "./NeptyneProtocol";
import {
  FullSheetCell,
  RemoteSheetCell,
  SimpleSheetCell,
} from "./neptyne-container/NeptyneContainer";

function createMsg(
  msgType: string,
  metadata: JSONObject,
  content: any
): KernelMessage.IShellMessage {
  return {
    header: {
      date: new Date().toISOString(),
      msg_id: uuid(),
      username: "username",
      session: "this.sessionId!",
      msg_type: msgType as any,
      version: "5.2",
    },
    metadata: metadata,
    content: content,
    buffers: [],
    parent_header: {},
    channel: "shell",
  };
}

function sheetUpdateMsg(updates: RemoteSheetCell[]): KernelMessage.IShellMessage {
  const content = {
    cellUpdates: updates,
  };
  return createMsg(MessageTypes.SheetUpdate, {}, content);
}

function simpleCell(col: number, value: string): SimpleSheetCell {
  return [[col, 0, 0], value, value];
}

function fullCell(col: number, value: string): FullSheetCell {
  return { attributes: {}, cellId: [col, 0, 0], code: value };
}

test("Condensed Message Processing", () => {
  const captured: KernelMessage.IMessage[] = [];
  function processMessage(msg: KernelMessage.IMessage) {
    captured.push(msg);
  }
  function doProcess(queue: KernelMessage.IMessage[]) {
    captured.splice(0);
    processCondensedMessages(queue, processMessage);
    return captured;
  }
  const idle = createMsg("status", {}, { execution_state: "idle" });
  const busy = createMsg("status", {}, { execution_state: "budy" });
  const stream = createMsg("stream", {}, { name: "stdout", text: "hello" });

  const equality = doProcess([busy, sheetUpdateMsg([simpleCell(1, "een")]), idle]);
  expect(equality.length).toEqual(3);

  const reduced = doProcess([
    busy,
    sheetUpdateMsg([simpleCell(1, "een")]),
    sheetUpdateMsg([simpleCell(2, "twee")]),
    sheetUpdateMsg([fullCell(1, "drie")]),
    idle,
  ]);
  expect(reduced.length).toEqual(3);

  expect((reduced[1].content as any).cellUpdates[0][1]).toEqual("twee");

  doProcess([
    busy,
    sheetUpdateMsg([simpleCell(1, "een")]),
    sheetUpdateMsg([simpleCell(2, "twee")]),
    stream,
    sheetUpdateMsg([fullCell(1, "drie")]),
    idle,
  ]);
  expect(reduced.length).toEqual(5);

  expect((reduced[1].content as any).cellUpdates[0][1]).toEqual("een");
});
