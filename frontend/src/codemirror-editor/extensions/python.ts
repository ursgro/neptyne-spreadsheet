import { pythonLanguage } from "@codemirror/lang-python";
import { indentUnit } from "@codemirror/language";
import { AutocompleteHandler } from "../../notebook/NotebookCellEditor/types";
import { AutocompleteOptions, getAutocompleteExtension } from "./autocomplete";

const pythonExtensions = [pythonLanguage, indentUnit.of("    ")];

export const getPythonExtensions = (
  getAutocomplete?: AutocompleteHandler,
  autocompleteOptions?: AutocompleteOptions
) => {
  const extensions = [...pythonExtensions];
  if (getAutocomplete) {
    extensions.push(
      getAutocompleteExtension(
        getAutocomplete,
        autocompleteOptions || { functionsOnly: false, useSpreadsheetFunctions: true }
      )
    );
  }
  return extensions;
};
