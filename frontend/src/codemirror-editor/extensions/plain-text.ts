/**
 * Currently plain-text simply needs to be displayed with alternative font.
 */
import { EditorView } from "@codemirror/view";

export const plainTextExtensions = [
  EditorView.theme({
    ".cm-scroller": {
      fontFamily: "sans-serif",
    },
  }),
  EditorView.lineWrapping,
];
