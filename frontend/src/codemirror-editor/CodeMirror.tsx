import {
  EditorSelection,
  EditorState,
  EditorStateConfig,
  Extension,
  StateEffect,
  TransactionSpec,
} from "@codemirror/state";
import { EditorView, ViewUpdate } from "@codemirror/view";
import {
  ComponentPropsWithoutRef,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { isEmpty, isEqual } from "lodash";

import { useFirstRender } from "./use-first-render";
import { cursorDocEnd } from "@codemirror/commands";
import { Box } from "@mui/material";

import { Decoration, DecorationSet } from "@codemirror/view";
import { StateField } from "@codemirror/state";

export const addUnderline = StateEffect.define<{ from: number; to: number }>({
  map: ({ from, to }, change) => ({
    from: change.mapPos(from),
    to: change.mapPos(to),
  }),
});

export const removeUnderline = StateEffect.define<{}>();

export const underlineField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(underlines, tr) {
    underlines = underlines.map(tr.changes);
    for (let e of tr.effects)
      if (e.is(addUnderline)) {
        underlines = underlines.update({
          add: [underlineMark.range(e.value.from, e.value.to)],
        });
      } else if (e.is(removeUnderline)) {
        underlines = underlines.update({ filter: () => false });
      }
    return underlines;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const underlineMark = Decoration.mark({ class: "cm-codex" });

export const underlineTheme = EditorView.baseTheme({
  ".cm-codex": { backgroundColor: "#c7ebe7", borderRadius: "5px" },
});

/**
 * Use this function as a default value for React callback prop.
 *
 * If you write anonymous function as a default prop value, it causes extre re-render.
 */
export const noop = () => {};

export interface CodeMirrorApi {
  focus: () => void;
  focusAtEnd: () => void;
  isSameDomElement: (el: HTMLElement) => boolean;
  dispatch: (tr: TransactionSpec) => void;
  getView: () => EditorView | undefined;
  goToLine: (line: number) => void;
}

export type CodeMirrorProps = {
  value?: EditorStateConfig["doc"];
  selection?: EditorStateConfig["selection"];
  extensions?: Extension[];
  elementProps?: ComponentPropsWithoutRef<typeof Box>;
  autofocus?: boolean;
  onUpdate?: (update: ViewUpdate) => void;
  editorViewFactory?: (config?: any) => EditorView;
  testId?: string;
  highlightSelection?: { from: number; to: number }[];
};

export const CodeMirror = forwardRef<CodeMirrorApi, CodeMirrorProps>(
  (
    {
      value,
      selection,
      autofocus,
      onUpdate,
      extensions: passedExtensions = [],
      elementProps,
      editorViewFactory = (config) => new EditorView(config),
      testId,
      highlightSelection,
    },
    codeMirriorApiRef
  ) => {
    const initialValue = value?.toString() || "";
    if (
      selection &&
      "ranges" in selection &&
      selection.ranges[0].to > initialValue.length
    ) {
      selection = undefined;
    }

    const innerRef = useRef<HTMLDivElement>(null);
    const currentValue = useRef(initialValue);
    const currentSelection = useRef(selection);
    const editorView = useRef<EditorView>();
    const firstRender = useFirstRender();

    const updateExtension = useMemo(
      () =>
        EditorView.updateListener.of((value) => {
          if (value.docChanged) {
            currentValue.current = value.state.doc.toString();
          }

          if (value.selectionSet) {
            currentSelection.current = value.state.selection;
          }

          if (onUpdate) onUpdate(value);
        }),
      [onUpdate]
    );

    const extensions = useMemo(
      () => [updateExtension, ...passedExtensions],
      [updateExtension, passedExtensions]
    );

    useLayoutEffect(() => {
      const state = EditorState.create({
        doc: value,
        selection: selection || EditorSelection.single(initialValue.length),
        extensions,
      });

      editorView.current = editorViewFactory({ parent: innerRef.current!, state });

      return () => {
        const view = editorView.current;
        if (view) {
          view.dispatch({ effects: StateEffect.reconfigure.of([]) });
          view.destroy();
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      if (firstRender || !editorView.current) return;

      editorView.current.dispatch({ effects: StateEffect.reconfigure.of(extensions) });
    }, [firstRender, extensions]);

    useEffect(() => {
      if (firstRender || !editorView.current) return;

      const update: TransactionSpec = {};

      if (value !== currentValue.current) {
        update.changes = {
          from: 0,
          to: editorView.current.state.doc.length,
          insert: value,
        };
      }

      if (!isEqual(selection, currentSelection.current)) {
        update.selection = selection;
      }

      // if codemirror text changes via props and selection is not stated explicitly,
      // caret may move to 0th symbol. So we have to explicitly set selection if it is not present
      if (update.changes && !update.selection && currentSelection.current) {
        try {
          update.selection = currentSelection.current;
          editorView.current.state.update(update);
        } catch (e) {
          if (e instanceof RangeError) {
            update.selection = EditorSelection.single(value?.length || 0);
          } else {
            throw e;
          }
        }
      }

      if (highlightSelection) {
        const isFirstHighlight = !editorView.current.state.field(underlineField, false);
        const effects: StateEffect<any>[] = [
          removeUnderline.of({}),
          ...highlightSelection.map((range) => addUnderline.of(range)),
        ];

        if (isFirstHighlight) {
          effects.unshift(
            StateEffect.appendConfig.of([underlineField, underlineTheme])
          );
        }

        if (effects) {
          update.effects = effects;
        }
      } else {
        update.effects = [removeUnderline.of({})];
      }

      if (isEmpty(update)) {
        return;
      }

      try {
        const transaction = editorView.current.state.update(update);
        editorView.current.dispatch(transaction);
      } catch (e) {
        // when we set editor state from above, we assume editor value is string and
        // editor selection is string.length.
        // However, edge cases like CRLF ("\r\n") sequence do not fit into this idea - they are
        // treated as a single character by Codemirror, but as two characters by Javascript.

        // So I thought the most generic way to fix this would be to catch for range errors and
        // to explicitly set caret to the end when this happens.
        if (e instanceof RangeError && update.selection) {
          const { selection, ...updateWithoutSelection } = update;
          const transactionWithoutSelection =
            editorView.current.state.update(updateWithoutSelection);
          editorView.current.dispatch(transactionWithoutSelection);
          const selectionTransaction = editorView.current.state.update({
            selection: EditorSelection.single(editorView.current.state.doc.length),
          });
          editorView.current.dispatch(selectionTransaction);
        } else {
          throw e;
        }
      }
    });

    // autofocus can be set after the editor is mounted, e.g. in Notebook during Shift-Enter
    useEffect(() => {
      if (autofocus && editorView.current) {
        editorView.current.focus();
      }
    }, [autofocus]);

    useImperativeHandle<CodeMirrorApi, CodeMirrorApi>(
      codeMirriorApiRef,
      () => ({
        focus: () => editorView.current?.focus(),
        focusAtEnd: () => {
          if (editorView.current) {
            cursorDocEnd(editorView.current);
            editorView.current.focus();
          }
        },
        isSameDomElement: (el) => el === editorView.current?.dom,
        dispatch: (tr: TransactionSpec) => {
          editorView.current?.dispatch(tr);
        },
        getView: () => editorView.current,
        goToLine: (line: number) => {
          if (editorView.current) {
            const { state } = editorView.current;
            const pos = state.doc.line(line).from;
            const tr = { selection: { anchor: pos, head: pos }, scrollIntoView: true };
            editorView.current.dispatch(tr);
          }
        },
      }),
      []
    );

    return <Box ref={innerRef} data-testid={testId} {...elementProps} />;
  }
);
