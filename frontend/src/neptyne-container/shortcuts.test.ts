import { KeyBindingMap } from "tinykeys";
import { getCharacterFromKeyCode, withDuplicatedShortcuts } from "./shortcuts";

test.each<[string, string]>([
  ["", ""],
  ["KeyK", "K"],
  ["Digit1", "1"],
  ["BracketLeft", "["],
  ["BracketRight", "]"],
])("getCharacterFromKeyCode(%s) === %s", (keyCode, character) =>
  expect(getCharacterFromKeyCode(keyCode)).toBe(character)
);

const noop = () => {};

test.each<[KeyBindingMap, KeyBindingMap]>([
  [{}, {}],
  [
    {
      KeyA: noop,
      KeyB: noop,
    },
    {
      KeyA: noop,
      KeyB: noop,
    },
  ],
  [
    {
      "Alt+KeyA": noop,
      "Alt+KeyB": noop,
      "Alt+KeyA KeyY KeyX": noop,
      "Alt+KeyB KeyY KeyX": noop,
      KeyB: noop,
    },
    {
      "Alt+KeyA": noop,
      "Alt+KeyB": noop,
      "Alt KeyA": noop,
      "Alt KeyB": noop,
      "Alt KeyA KeyY KeyX": noop,
      "Alt KeyB KeyY KeyX": noop,
      "Alt+KeyA KeyY KeyX": noop,
      "Alt+KeyB KeyY KeyX": noop,
      "Alt+KeyA Alt+KeyY KeyX": noop,
      "Alt+KeyB Alt+KeyY KeyX": noop,
      "Alt+KeyA Alt+KeyY Alt+KeyX": noop,
      "Alt+KeyB Alt+KeyY Alt+KeyX": noop,
      KeyB: noop,
    },
  ],
])("withDuplicatedShortcuts(%p) === %p", (keyBindingMap, keyBindingMapWithDuplicates) =>
  expect(withDuplicatedShortcuts(keyBindingMap)).toEqual(keyBindingMapWithDuplicates)
);
