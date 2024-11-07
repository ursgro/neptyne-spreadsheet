import { forwardRef, memo, useEffect, useMemo } from "react";

import {
  BaseCodeEditor,
  BaseCodeEditorProps,
} from "../../codemirror-editor/BaseCodeEditor/BaseCodeEditor";
import { lineNumbers } from "@codemirror/view";
import { Compartment, EditorSelection } from "@codemirror/state";
import { linter, LintSource } from "@codemirror/lint";
import { AutocompleteHandler } from "./types";
import {
  busyGutter,
  promptGutter,
} from "../../codemirror-editor/BaseCodeEditor/prompt-gutter";
import { sheetOnlyHotKeys } from "../../hotkeyConstants";
import { CodeMirrorApi } from "../../codemirror-editor/CodeMirror";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import {
  EditorType,
  getSheetLanguageExtensions,
} from "../../neptyne-sheet/SheetCodeEditor/sheetCodeEditorUtils";

interface NotebookCellEditorProps extends BaseCodeEditorProps {
  editorType: EditorType;
  getAutocomplete?: AutocompleteHandler;
  showLineNumbers?: boolean;
  lintSource?: LintSource;
  isBusy?: boolean;
  placeholder?: string;
}

/**
 * Editor for notebook page.
 *
 * Supports of extra keyboard shortcuts and uses editor features for provided 'mode'.
 */
export const NotebookCellEditor = memo(
  forwardRef<CodeMirrorApi, NotebookCellEditorProps>(
    (
      {
        editorType,
        getAutocomplete,
        fullHeight,
        showLineNumbers,
        lintSource,
        extraKeyBindings,
        extensions,
        isBusy,
        ...props
      },
      ref
    ) => {
      const languageSpecificExtensions = useMemo(
        () =>
          getSheetLanguageExtensions(
            (props.value || "").toString(),
            getAutocomplete,
            editorType
          ),
        [getAutocomplete, props.value, editorType]
      );

      const keyBindings = useMemo(
        () => [...(extraKeyBindings || []), indentWithTab, ...defaultKeymap],
        [extraKeyBindings]
      );

      const linterCompartment = useMemo(() => new Compartment(), []);
      useEffect(() => {
        // Reconfigure the lint config whenever the component re-renders to force the lines to come back
        if (lintSource && ref && "current" in ref && ref.current) {
          const extention = linter(lintSource, { delay: 0 });
          ref.current.dispatch({
            effects: linterCompartment.reconfigure(extention),
          });
        }
      });

      const updatedExtensions = useMemo(() => {
        const gutterExtensions = [];
        if (showLineNumbers) {
          gutterExtensions.push(
            lineNumbers({
              domEventHandlers: {
                click: (view, block) => {
                  view.dispatch({
                    selection: EditorSelection.single(block.to, block.from),
                  });
                  view.focus();
                  return false;
                },
              },
            })
          );
        } else if (isBusy) {
          gutterExtensions.push(busyGutter);
        } else {
          gutterExtensions.push(promptGutter(">>>", () => {}));
        }
        return [
          ...languageSpecificExtensions,
          ...gutterExtensions,
          ...(extensions || []),
          linterCompartment.of([]),
        ];
      }, [
        showLineNumbers,
        isBusy,
        languageSpecificExtensions,
        extensions,
        linterCompartment,
      ]);

      return (
        <BaseCodeEditor
          ref={ref}
          extensions={updatedExtensions}
          extraKeyBindings={keyBindings}
          mutedHotKeys={sheetOnlyHotKeys}
          fullHeight={fullHeight}
          {...props}
        />
      );
    }
  )
);
