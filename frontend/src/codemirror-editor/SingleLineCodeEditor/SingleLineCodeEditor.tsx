import React, { forwardRef, useMemo } from "react";
import { KeyBinding } from "@codemirror/view";

import { BaseCodeEditor, BaseCodeEditorProps } from "../BaseCodeEditor/BaseCodeEditor";
import { CodeMirrorApi, noop } from "../CodeMirror";
import { conflictingHotKeys } from "../../hotkeyConstants";
import { insertNewline } from "@codemirror/commands";

export interface SingleLineCodeEditorProps extends BaseCodeEditorProps {
  onCancel?: (value: string) => void;
  onSubmit?: (value: string) => void;
  onTabSubmit?: (value: string) => void;
}

export const SingleLineCodeEditor = forwardRef<
  CodeMirrorApi,
  SingleLineCodeEditorProps
>(
  (
    { onSubmit = noop, onTabSubmit = noop, onCancel = noop, extraKeyBindings, ...rest },
    codeMirriorApiRef
  ) => {
    const keyBindings: KeyBinding[] = useMemo(
      () => [
        {
          key: "Cmd-Enter",
          preventDefault: true,
          run: (view) => {
            insertNewline(view);
            return true;
          },
        },
        {
          key: "Control-Enter",
          preventDefault: true,
          run: (view) => {
            insertNewline(view);
            return true;
          },
        },
        {
          key: "Enter",
          preventDefault: true,
          run: (view) => {
            onSubmit(view.state.doc.toString());
            return false;
          },
        },
        {
          key: "Tab",
          preventDefault: true,
          run: (view) => {
            onTabSubmit(view.state.doc.toString());
            return false;
          },
        },
        {
          key: "Escape",
          preventDefault: true,
          run: (view) => {
            onCancel(view.state.doc.toString());
            return false;
          },
        },
        ...(extraKeyBindings || []),
      ],
      [onSubmit, onTabSubmit, onCancel, extraKeyBindings]
    );

    return (
      <BaseCodeEditor
        ref={codeMirriorApiRef}
        extraKeyBindings={keyBindings}
        mutedHotKeys={conflictingHotKeys}
        {...rest}
      />
    );
  }
);
