import {
  ComponentPropsWithoutRef,
  CSSProperties,
  forwardRef,
  SyntheticEvent,
  useCallback,
  useMemo,
} from "react";
import { EditorState, Transaction } from "@codemirror/state";
import {
  EditorView,
  ViewUpdate,
  highlightSpecialChars,
  KeyBinding,
  keymap,
  placeholder,
} from "@codemirror/view";
import {
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { history } from "@codemirror/commands";
import { closeBrackets } from "@codemirror/autocomplete";
import { highlightSelectionMatches } from "@codemirror/search";
import { createKeybindingsHandler } from "tinykeys";
import zipObject from "lodash/zipObject";
import isEmpty from "lodash/isEmpty";
import merge from "lodash/merge";

import { CodeMirror, CodeMirrorApi, CodeMirrorProps, noop } from "../CodeMirror";
import { keymapConfig } from "../extensions/keymap";
import { hotKeys } from "../../hotkeyConstants";
import { Box } from "@mui/material";

export interface BaseCodeEditorProps extends CodeMirrorProps {
  onBlur?: (event: FocusEvent, view: EditorView) => void;
  onFocus?: (view: EditorView) => void;
  onChanges?: (value: string, isUserEvent: boolean) => void;
  onClick?: (view: EditorView) => void;
  extraKeyBindings?: KeyBinding[];
  readOnly?: boolean;
  fullHeight?: boolean;
  mutedHotKeys?: Partial<typeof hotKeys>;
  placeholder?: string | HTMLElement;
  withClosedBrackets?: boolean;
}

const DEFAULT_EXTENSIONS = [
  highlightSpecialChars(),
  history(),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle),
  bracketMatching(),
  highlightSelectionMatches(),
];

const transactionMatchesEvent = (transaction: Transaction, events: string[]) =>
  events.map((event) => transaction.isUserEvent(event)).some((v) => v);

const transactionIsCommentUncomment = (
  transaction: Transaction,
  prevState: EditorState
) => {
  // Commenting using the keyboard shortcut is not annotated as a user event,
  // so we check it ourselves
  let comment = true;
  let uncomment = true;
  const prevText = prevState.doc;
  transaction.changes.iterChanges((fromA, toA, fromB, toB, text) => {
    if (text !== undefined) {
      comment = comment && text.length === 2 && text.line(1).text === "# ";
      uncomment =
        !comment &&
        uncomment &&
        fromB === toB &&
        prevText.sliceString(fromA, toA) === "# ";
    } else {
      comment = uncomment = false;
    }
  });
  return transaction.changes.length > 0 && (comment || uncomment);
};

const transactionIsUserEvent = (transaction: Transaction) => {
  return (
    transactionMatchesEvent(transaction, [
      "input",
      "delete",
      "move",
      "select",
      "undo",
      "redo",
    ]) || transactionIsCommentUncomment(transaction, transaction.startState)
  );
};

export const BaseCodeEditor = forwardRef<CodeMirrorApi, BaseCodeEditorProps>(
  (
    {
      value,
      extensions = [],
      extraKeyBindings = [],
      autofocus,
      readOnly = false,
      withClosedBrackets = false,
      onBlur = noop,
      onFocus = noop,
      onChanges = noop,
      onUpdate = noop,
      onClick = noop,
      fullHeight = false,
      elementProps,
      mutedHotKeys,
      placeholder: placeholderProp,
      ...rest
    },
    codeMirrorApiRef
  ) => {
    const domEventHandlerExtension = useMemo(() => {
      return EditorView.domEventHandlers({
        blur: (event, view) => {
          // do not fire blur event when search panel is in focus
          if (event.relatedTarget && isSearchPanel(event.relatedTarget)) {
            return;
          }
          onBlur(event, view);
        },
        focus: (event, view) => {
          onFocus(view);
        },
        click: (event, view) => {
          onClick(view);
        },
      });
    }, [onBlur, onFocus, onClick]);

    const keymapExtension = useMemo(() => {
      return keymap.of([...keymapConfig, ...extraKeyBindings]);
    }, [extraKeyBindings]);

    const readOnlyExtensions = useMemo(() => {
      if (readOnly) {
        return [EditorState.readOnly.of(true), EditorView.editable.of(false)];
      }
      return [];
    }, [readOnly]);

    const bracketMatchingExtensions = useMemo(
      () => (withClosedBrackets ? [closeBrackets()] : []),
      [withClosedBrackets]
    );

    const editorExtensions = useMemo(
      () => [
        ...DEFAULT_EXTENSIONS,
        ...extensions,
        keymapExtension,
        domEventHandlerExtension,
        readOnlyExtensions,
        bracketMatchingExtensions,
        ...[placeholderProp ? placeholder(placeholderProp) : []],
      ],
      [
        extensions,
        keymapExtension,
        domEventHandlerExtension,
        readOnlyExtensions,
        placeholderProp,
        bracketMatchingExtensions,
      ]
    );

    const codeMirrorElementProps = useMemo(() => {
      const style: CSSProperties = {};

      if (fullHeight) {
        style.height = "100%";
      }

      const baseElementProps: ComponentPropsWithoutRef<typeof Box> = merge(
        { style },
        elementProps
      );

      if (!isEmpty(mutedHotKeys)) {
        const keyCombinations: string[] = Object.values(mutedHotKeys!);
        const hotKeyHandler = createKeybindingsHandler(
          zipObject(
            keyCombinations,
            Array(keyCombinations.length).fill((event: KeyboardEvent) =>
              event.stopPropagation()
            )
          )
        );
        baseElementProps.onKeyDown = (
          event: SyntheticEvent<EventTarget, KeyboardEvent>
        ) => {
          hotKeyHandler(event.nativeEvent);
        };
      }

      return baseElementProps;
    }, [fullHeight, mutedHotKeys, elementProps]);

    const handleUpdate = useCallback(
      (viewUpdate: ViewUpdate) => {
        if (viewUpdate.docChanged) {
          const isUserEvent = viewUpdate.transactions
            .flatMap(transactionIsUserEvent)
            .some((v) => v);
          onChanges(viewUpdate.state.doc.toString(), isUserEvent);
        }
        onUpdate(viewUpdate);
      },
      [onChanges, onUpdate]
    );

    return (
      <CodeMirror
        ref={codeMirrorApiRef}
        value={value}
        autofocus={autofocus}
        onUpdate={handleUpdate}
        extensions={editorExtensions}
        elementProps={codeMirrorElementProps}
        {...rest}
      />
    );
  }
);

const isSearchPanel = (element: any) =>
  // @ts-ignore
  element.parentElement && element.parentElement.className === "cm-search cm-panel";
