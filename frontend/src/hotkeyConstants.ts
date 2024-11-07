import { isChrome, isMacOs } from "react-device-detect";

function freezeObject<T extends Object>(obj: T): Readonly<T> {
  Object.freeze(obj);

  return obj;
}

export const conflictingHotKeys = freezeObject({
  undo: "$mod+KeyZ",
  redo: "$mod+Shift+KeyZ",
  selectRow: "Shift+Space",
  selectColumn: "Control+Space",
  clearCellsBackspace: "Backspace",
  clearCellsDelete: "Delete",
  skipRight: "$mod+ArrowRight",
  skipLeft: "$mod+ArrowLeft",
  skipUp: "$mod+ArrowUp",
  skipDown: "$mod+ArrowDown",
  skipSelectRight: "$mod+Shift+ArrowRight",
  skipSelectLeft: "$mod+Shift+ArrowLeft",
  skipSelectUp: "$mod+Shift+ArrowUp",
  skipSelectDown: "$mod+Shift+ArrowDown",
});

export const sheetOnlyHotKeys = {
  ...conflictingHotKeys,
  insertRowBefore: "Control+BracketLeft",
  insertColumnBefore: "Control+BracketRight",
  insertRowAfter: "$mod+BracketLeft",
  insertColumnAfter: "$mod+BracketRight",
  deleteRow: "Control+Alt+BracketLeft",
  deleteColumn: "Control+Alt+BracketRight",
  scrollSheetDown: "Alt+ArrowDown",
  scrollSheetUp: "Alt+ArrowUp",
  formatAsFloat: "Control+Shift+Digit1",
  formatAsTime: "Control+Shift+Digit2",
  formatAsDate: "Control+Shift+Digit3",
  formatAsCurrency: "Control+Shift+Digit4",
  formatAsPercentage: "Control+Shift+Digit5",
  bold: "$mod+KeyB",
  startSearch: "$mod+KeyF",
  escape: "Escape",
  italic: "$mod+KeyI",
  underline: "$mod+KeyU",
  clearCells: "$mod+Backslash",
  alignTextCenter: "$mod+Shift+KeyE",
  alignTextLeft: "$mod+Shift+KeyL",
  alignTextRight: "$mod+Shift+KeyR",
  toggleBorderTop: "Alt+Shift+Digit1",
  toggleBorderRight: "Alt+Shift+Digit2",
  toggleBorderBottom: "Alt+Shift+Digit3",
  toggleBorderLeft: "Alt+Shift+Digit4",
  clearBorder: "Alt+Shift+Digit6",
  toggleOuterBorder: "Alt+Shift+Digit7",
  toggleOuterBorderCtrl: "$mod+Shift+Digit7",
  openHyperlink: "Alt+Enter",
  hideRowHeader: "$mod+Alt+Digit9",
  hideColumnHeader: "$mod+Alt+Digit0",
  showRowHeader: "$mod+Shift+Digit9",
  showColumnHeader: "$mod+Shift+Digit0",
  addLink: "$mod+KeyK",
  selectAll: "$mod+KeyA",
  editNote: "Shift+F2",
  mergeCells: "$mod+KeyM",
  // Platform-specific bindings
  platformInsertRowBefore: "Alt+Shift+KeyI KeyR",
  platformInsertColumnBefore: "Alt+Shift+KeyI KeyC",
  platformInsertRowAfter: "Alt+Shift+KeyI KeyB",
  platformInsertColumnAfter: "Alt+Shift+KeyI KeyW",
  platformDeleteRow: "Alt+Shift+KeyE KeyD",
  platformDeleteColumn: "Alt+Shift+KeyE KeyE",
  decreaseFontSize: "Alt+KeyH KeyF KeyK",
  increaseFontSize: "Alt+KeyH KeyF KeyG",
  openShortcutModal: "Alt+KeyH",
};

if (isMacOs) {
  sheetOnlyHotKeys.platformInsertRowBefore = "Control+Alt+KeyI KeyR";
  sheetOnlyHotKeys.platformInsertColumnBefore = "Control+Alt+KeyI KeyC";
  sheetOnlyHotKeys.platformInsertRowAfter = "Control+Alt+KeyI KeyB";
  sheetOnlyHotKeys.platformInsertColumnAfter = "Control+Alt+KeyI KeyO";
  sheetOnlyHotKeys.platformDeleteRow = "Control+Alt+KeyE KeyD";
  sheetOnlyHotKeys.platformDeleteColumn = "Control+Alt+KeyE KeyE";
} else if (isChrome) {
  sheetOnlyHotKeys.platformInsertRowBefore = "Alt+KeyI KeyR";
  sheetOnlyHotKeys.platformInsertColumnBefore = "Alt+KeyI KeyC";
  sheetOnlyHotKeys.platformInsertRowAfter = "Alt+KeyI KeyB";
  sheetOnlyHotKeys.platformInsertColumnAfter = "Alt+KeyI KeyW";
  sheetOnlyHotKeys.platformDeleteRow = "Alt+KeyE KeyD";
  sheetOnlyHotKeys.platformDeleteColumn = "Alt+KeyE KeyE";
}

Object.freeze(sheetOnlyHotKeys);

export const nativeHotKeys = freezeObject({
  copy: "$mod+KeyC",
  cut: "$mod+KeyX",
  paste: "$mod+KeyV",
});

export const hotKeys = freezeObject({
  ...nativeHotKeys,
  ...sheetOnlyHotKeys,
  download: "Control+Shift+KeyD",
  createNewSheet: "Shift+F11",
  createNewTyne: "$mod+KeyN",
  openTyne: "$mod+KeyO",
});

export const shortcutModalHotKeys = {
  setBackgroundColor: "Alt+KeyH KeyH",
  setFontColor: "Alt+KeyH KeyF KeyC",
  renameSheet: "Alt+KeyH KeyO KeyR",
  addSheet: "Alt+KeyH KeyI KeyS",
  deleteSheet: "Alt+KeyH KeyD KeyS",
  showGridlines: "Alt+KeyW KeyV KeyG",
  bordersAll: "Alt+KeyH KeyB KeyA",
  bordersOutside: "Alt+KeyH KeyB KeyS",
  alignTextBottom: "Alt+KeyH KeyA KeyB",
  alignTextMiddle: "Alt+KeyH KeyA KeyM",
  alignTextTop: "Alt+KeyH KeyA KeyT",
  clearCellFormatting: "Alt+KeyH KeyE KeyF",
  changeCellFont: "Alt+KeyH KeyF KeyF",
  autofitCellWidth: "Alt+KeyH KeyO KeyI",
  autofitCellHeight: "Alt+KeyH KeyO KeyA",
  bold: "Alt+KeyH KeyB",
  alignTextLeft: "Alt+KeyH KeyA KeyL",
  alignTextCenter: "Alt+KeyH KeyA KeyC",
  alignTextRight: "Alt+KeyH KeyA KeyR",
  toggleBorderBottom: "Alt+KeyH KeyB KeyB",
  toggleBorderLeft: "Alt+KeyH KeyB KeyL",
  toggleBorderTop: "Alt+KeyH KeyB KeyT",
  toggleBorderRight: "Alt+KeyH KeyB KeyR",
};
