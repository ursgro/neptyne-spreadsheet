import { isMacOs } from "react-device-detect";

export function makeHotKeyHumanReadable(hotKey: string): string {
  hotKey = hotKey
    .replace(/\$mod/g, isMacOs ? "⌘" : "Ctrl")
    .replace(/Control/g, "Ctrl")
    .replace(/Digit|Key([0-9A-Z])/g, "$1");

  if (isMacOs) hotKey = hotKey.replace(/Alt/g, "Option");

  return hotKey;
}
