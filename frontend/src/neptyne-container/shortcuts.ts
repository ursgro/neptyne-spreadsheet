import range from "lodash/range";
import { KeyBindingMap } from "tinykeys";

const CODES_TO_SPECIAL_CHARACTERS: Record<string, string> = {
  BracketLeft: "[",
  BracketRight: "]",
};

export const getCharacterFromKeyCode = (keyCode: string): string =>
  CODES_TO_SPECIAL_CHARACTERS[keyCode] ?? keyCode.replace(/(Key)|(Digit)/g, "");

/**
 * Loops through a map of shortcuts and adds alternative ways to trigger some of them.
 *
 * For all the shortcuts starting from Alt, we also allow to press all the keys in a sequence
 * (like a combo in a fighting game) and to press all the keys while Alt is still pressed
 */
export const withDuplicatedShortcuts = (map: KeyBindingMap): KeyBindingMap =>
  Object.keys(map).reduce(
    (updatedMap, key) =>
      shouldDuplicateShortcut(key)
        ? {
            ...duplicateShortcut(key).reduce(
              (obj, duplicateKey) => ({ ...obj, [duplicateKey]: updatedMap[key] }),
              updatedMap
            ),
          }
        : updatedMap,
    map
  );

export const shouldDuplicateShortcut = (shortcut: string): boolean =>
  shortcut.startsWith("Alt");

export const duplicateShortcut = (shortcut: string): string[] => [
  shortcut.replace(/\+/g, " "),
  ...withReleasingAlt(shortcut),
];

/**
 * When pressing a Alt+T T T T T shortcut, user can release Alt at any moment.
 *
 * So here we take Alt+T T T T T shortcut, and create its alternative versions:
 * Alt+T Alt+T Alt+T Alt+T Alt+T
 * Alt+T Alt+T Alt+T Alt+T T
 * Alt+T Alt+T Alt+T T T
 * Alt+T Alt+T T T T
 * Alt+T T T T T
 */
export const withReleasingAlt = (shortcut: string): string[] => {
  const shortcutSegments = shortcut.split(" ");
  return range(0, shortcutSegments.length).map((releaseAltAtSegment) =>
    shortcutSegments
      .map((segment, segmendIdx) =>
        segmendIdx === 0 || segmendIdx > releaseAltAtSegment
          ? segment
          : `Alt+${segment}`
      )
      .join(" ")
  );
};
