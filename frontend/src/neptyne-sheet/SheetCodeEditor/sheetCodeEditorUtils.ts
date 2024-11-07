import { Compartment, Extension, Prec } from "@codemirror/state";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { getPythonExtensions } from "../../codemirror-editor/extensions/python";
import { plainTextExtensions } from "../../codemirror-editor/extensions/plain-text";
import { AutocompleteHandler } from "../../notebook/NotebookCellEditor/types";
import { completionStatus } from "@codemirror/autocomplete";
import { AutocompleteOptions } from "../../codemirror-editor/extensions/autocomplete";
import { isFormulaValue } from "../../SheetUtils";
import {
  aiExtensions,
  aiHistoryExtensions,
} from "../../codemirror-editor/extensions/ai-prompt";
import { parser } from "@lezer/python";

export enum EditorType {
  sheet = "sheet",
  repl = "repl",
  codepane = "codepane",
  replPython = "replPython",
  replAI = "replAI",
  replAIHistory = "replAIHistory",
}

/**
 * Dynamically handles language extensions for sheets.
 *
 * @returns A list of language extensions and extension that takes the newest editor update
 * and reconfigures editor state.
 */
export const getSheetLanguageExtensions = (
  initialValue: string,
  getAutocomplete?: AutocompleteHandler,
  editorType: EditorType = EditorType.sheet
): Extension[] => {
  const languageCompartment = new Compartment();

  /**
   * If new editor value starts with '=', it is considered to be formula and should
   * be highlighted as Python code.
   *
   * Otherwise, it should be displayed as plain text.
   */
  const updateListenerExtension = EditorView.updateListener.of((update: ViewUpdate) => {
    if (update.docChanged) {
      const stringValue = update.state.doc.toString();

      update.view.dispatch({
        effects: languageCompartment.reconfigure(
          getExtensionsByValue(
            stringValue,
            getAutocomplete,
            {
              functionsOnly: false,
              useSpreadsheetFunctions: true,
            },
            editorType
          )
        ),
      });
    }
  });
  return [
    // Prevent keydown propagation for autocomplete select
    Prec.highest(
      EditorView.domEventHandlers({
        keydown: (event, view) => {
          if (
            ["Enter", "Tab", "Escape"].includes(event.key) &&
            completionStatus(view.state) === "active"
          )
            event.stopPropagation();
        },
      })
    ),
    languageCompartment.of(
      getExtensionsByValue(
        initialValue,
        getAutocomplete,
        {
          functionsOnly: false,
          useSpreadsheetFunctions: true,
        },
        editorType
      )
    ),
    updateListenerExtension,
  ];
};

export const looksLikePythonCode = (value: string): boolean => {
  if (value.length === 0) {
    return true;
  }

  if (value.trimStart().startsWith("!") || value.trimStart().startsWith("%")) {
    return true;
  }

  const escaped = value.replaceAll(/[A-Z0-9]+:[A-Z0-9]+/g, "A").replaceAll("!", "");
  const tree = parser.parse(escaped);
  let seenError = false;
  let afterError = 0;
  tree.iterate({
    enter: (node) => {
      if (node.node.firstChild !== null) {
        return;
      }
      if (node.type.isError) {
        seenError = true;
      } else if (seenError) {
        afterError += 1;
      }
    },
  });

  return afterError < 2;
};

const getExtensionsByValue = (
  value: string,
  getAutocomplete: any,
  autocompleteOptions: AutocompleteOptions,
  editorType: EditorType
): Extension[] => {
  if (
    editorType === EditorType.codepane ||
    editorType === EditorType.replPython ||
    (editorType === EditorType.sheet && isFormulaValue(value))
  ) {
    return getPythonExtensions(getAutocomplete, autocompleteOptions);
  } else if (editorType === EditorType.replAI) {
    return aiExtensions;
  } else if (editorType === EditorType.replAIHistory) {
    return aiHistoryExtensions;
  } else {
    return plainTextExtensions;
  }
};
