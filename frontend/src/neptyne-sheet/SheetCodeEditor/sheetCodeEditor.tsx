import { forwardRef, useCallback, useMemo } from "react";

import {
  SingleLineCodeEditor,
  SingleLineCodeEditorProps,
} from "../../codemirror-editor/SingleLineCodeEditor/SingleLineCodeEditor";
import { CodeMirrorApi, noop } from "../../codemirror-editor/CodeMirror";
import { AutocompleteHandler } from "../../notebook/NotebookCellEditor/types";
import { EditorType, getSheetLanguageExtensions } from "./sheetCodeEditorUtils";

export interface SheetCodeEditorProps extends Omit<SingleLineCodeEditorProps, "mode"> {
  activeRow: number;
  activeColumn: number;
  value: string;
  getAutocomplete?: AutocompleteHandler;
}

const SheetCodeEditor = forwardRef<CodeMirrorApi, SheetCodeEditorProps>(
  (
    {
      value,
      extensions,
      getAutocomplete,
      onChanges = noop,
      onCancel = noop,
      onUpdate = noop,
      ...rest
    },
    ref
  ) => {
    const updatedExtensions = useMemo(() => {
      return [
        ...getSheetLanguageExtensions(value, getAutocomplete, EditorType.sheet),
        ...(extensions || []),
      ];
    }, [value, extensions, getAutocomplete]);

    const handleCancel = useCallback(() => {
      onCancel(value);
    }, [onCancel, value]);

    return (
      <SingleLineCodeEditor
        ref={ref}
        extensions={updatedExtensions}
        value={value}
        onChanges={onChanges}
        onUpdate={onUpdate}
        onCancel={handleCancel}
        {...rest}
      />
    );
  }
);

export default SheetCodeEditor;
