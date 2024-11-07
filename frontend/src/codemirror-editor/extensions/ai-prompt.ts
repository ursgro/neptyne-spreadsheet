import { EditorView } from "@codemirror/view";
import { fontFamily } from "../../theme";

export const aiExtensions = [
  EditorView.theme({
    ".cm-scroller": {
      fontFamily: fontFamily,
      background: "linear-gradient(-45deg, #FFFFFF, #26bfad40, #FFFFFF, #26bfad40)",
      backgroundSize: "200% 200%",
      animation: "gradient 15s ease infinite",
      backgroundOpacity: 0.1,
    },

    "@keyframes gradient": {
      "0%": {
        backgroundPosition: "0% 50%",
      },
      "50%": {
        backgroundPosition: "100% 50%",
      },
      "100%": {
        backgroundPosition: "0% 50%",
      },
    },
  }),
  EditorView.lineWrapping,
];

export const aiHistoryExtensions = [
  EditorView.theme({
    ".cm-scroller": {
      fontFamily: fontFamily,
    },
  }),
  EditorView.lineWrapping,
];
