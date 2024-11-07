import { EditorView } from "@codemirror/view";

export const mobileFontExtensions = [
  EditorView.theme({
    ".cm-scroller": {
      fontSize: "16px",
    },
  }),
];
