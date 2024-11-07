import { syntaxTree } from "@codemirror/language";
import { SyntaxNode } from "@lezer/common";
import {
  Completion,
  CompletionContext,
  autocompletion,
  completionStatus,
  acceptCompletion,
} from "@codemirror/autocomplete";
import {
  AutocompleteHandler,
  AutocompleteItemArgument,
  AutocompleteResponseItem,
} from "../../notebook/NotebookCellEditor/types";
import { Extension, StateField, StateEffect } from "@codemirror/state";
import { EditorView, keymap, showTooltip } from "@codemirror/view";

export interface AutocompleteOptions {
  functionsOnly: boolean;
  useSpreadsheetFunctions: boolean;
}

export type AutocompleteArguments = Record<
  string,
  { label: string; args: AutocompleteItemArgument[] }
>;

const completePropertyAfter = ".";
const dontCompleteIn = ["String"];

const fetchedArgumentsEffect = StateEffect.define<AutocompleteResponseItem | undefined>(
  {}
);
const createAutocompleteArgumentsTooltip = StateField.define<
  AutocompleteResponseItem | undefined
>({
  create: () => undefined,

  update(tooltips, tr) {
    for (let effect of tr.effects) {
      if (effect.is(fetchedArgumentsEffect)) {
        return effect.value;
      }
    }
    return tooltips;
  },

  provide: (f) =>
    showTooltip.computeN([f], (state) => {
      const field = state.field(f);

      return field
        ? [
            {
              pos: state.selection.ranges[0].from,
              strictSide: false,
              create: (view) => {
                let dom = document.createElement("div");
                const argsRepr = (field.args || []).map(({ name }) => name).join(", ");
                const detailRepr = field.detail ? `\n${field.detail}` : "";
                dom.innerText = `${field.label}(${argsRepr})${detailRepr}`;
                dom.className = "cm-tooltip-autocomplete cm-tooltip cm-tooltip-above";
                dom.style.fontFamily = "monospace";
                dom.style.padding = "5px";
                dom.style.whiteSpace = "break-spaces";
                dom.style.overflowY = "auto";
                dom.style.overflowWrap = "break-word";

                const grid = document.getElementById("outer-grid-container");
                const codePanel = document.getElementById("code-editor");
                const notebook = document.getElementById("notebook");
                const editorRect = view.dom.getBoundingClientRect();
                if (grid?.contains(view.dom)) {
                  const gridRect = grid.getBoundingClientRect();
                  if (gridRect.width > editorRect.left + editorRect.width) {
                    dom.style.maxWidth = `600px`;
                    dom.style.width = "max-content";
                  }
                } else if (codePanel?.contains(view.dom)) {
                  dom.style.maxWidth = editorRect.width * 0.9 + "px";
                  dom.style.maxHeight = editorRect.height / 2 + "px";
                } else if (notebook?.contains(view.dom)) {
                  dom.style.maxWidth = editorRect.width * 0.9 + "px";
                  dom.style.maxHeight = "200px";
                }

                return { dom };
              },
            },
          ]
        : [];
    }),
});

const autocompleteArgumentsBlurHandler = EditorView.domEventHandlers({
  blur: (event, view) => {
    view.dispatch({
      effects: fetchedArgumentsEffect.of(undefined),
    });
  },
});

const getAutocompleteArgumentsExtension = (
  getAutocomplete: AutocompleteHandler,
  options: AutocompleteOptions
) => {
  const fetchAutocompleteArguments = EditorView.updateListener.of((update) => {
    if ((update.docChanged || update.selectionSet) && update.view.hasFocus) {
      const cursor = update.state.selection.main.head;
      const codeContents = update.state.doc.toString();
      const beforeCursor = codeContents.substring(0, cursor);
      let unclosedParenthesesAt: number | null = null;
      for (let i = 0; i < beforeCursor.length; i++) {
        if (beforeCursor[i] === "(") {
          unclosedParenthesesAt = i;
        }
        if (beforeCursor[i] === ")") {
          unclosedParenthesesAt = null;
        }
      }
      if (unclosedParenthesesAt) {
        const node: SyntaxNode = syntaxTree(update.state).resolveInner(
          unclosedParenthesesAt - 1,
          -1
        );
        let functionName = codeContents.substring(node.from, node.to);
        let prevNode = node.prevSibling;
        while (prevNode) {
          const possibleDot = codeContents.substring(prevNode.from, prevNode.to);
          if (possibleDot === ".") {
            prevNode = prevNode.prevSibling;
            if (!prevNode) break;
            functionName =
              codeContents.substring(prevNode.from, prevNode.to) + "." + functionName;
          } else {
            break;
          }
          prevNode = prevNode.prevSibling;
        }
        getAutocomplete(
          {
            expression: functionName,
            cursorPosition: functionName.length,
            kwargs: { skip_formulas: !options.useSpreadsheetFunctions },
          },
          "globalObject"
        ).then(({ result }) =>
          update.view.dispatch({
            effects: fetchedArgumentsEffect.of(result[0]),
          })
        );
      } else {
        update.view.dispatch({
          effects: fetchedArgumentsEffect.of(undefined),
        });
      }
    }
  });
  return [
    fetchAutocompleteArguments,
    createAutocompleteArgumentsTooltip,
    autocompleteArgumentsBlurHandler,
  ];
};

export const getAutocompleteExtension = (
  getAutocomplete: AutocompleteHandler,
  options: AutocompleteOptions
): Extension => {
  return [
    autocompletion({
      override: [
        (context: CompletionContext) =>
          handleAutocompletion(context, getAutocomplete, options),
      ],
    }),
    keymap.of([
      {
        key: "Tab",
        run: (view) => {
          if (completionStatus(view.state) === "active") {
            acceptCompletion(view);
            return true;
          }
          return false;
        },
      },
    ]),
    getAutocompleteArgumentsExtension(getAutocomplete, options),
  ];
};

const handleAutocompletion = (
  context: CompletionContext,
  getAutocomplete: AutocompleteHandler,
  autocompleteOptions: AutocompleteOptions
) => {
  const node: SyntaxNode = syntaxTree(context.state).resolveInner(context.pos, -1);
  const nodeBefore = node.prevSibling;

  if (dontCompleteIn.includes(node?.name)) return null;

  const expression = context.state.doc.toString();

  if (
    (node.name === completePropertyAfter ||
      nodeBefore?.name === completePropertyAfter) &&
    !autocompleteOptions.functionsOnly
  ) {
    const targetNode = node.name === completePropertyAfter ? node : nodeBefore;
    const dotPos = targetNode?.to || context.pos;
    return getAutocomplete(
      {
        expression: expression.startsWith("=") ? expression.substring(1) : expression,
        cursorPosition: expression.startsWith("=") ? dotPos - 1 : dotPos,
      },
      "property"
    ).then((response) => {
      const { result } = response;
      // transform server results to codemirror-friendly format
      const options = result.map(({ label, detail, type, args }) =>
        createAutocompleteOption({ label, detail, type, args }, autocompleteOptions)
      );
      return {
        from: targetNode!.to,
        options,
      };
    });
  }

  const word = expression.substring(node.from, node.to);

  // skip autocompletion if there is no word, it wasnt called programmatically or if cursor is not
  // at the end of the word
  if (
    !word ||
    (node.from === node.to && !context.explicit) ||
    node.to !== context.pos ||
    node.prevSibling?.name === ":"
  )
    return null;

  return getAutocomplete(
    {
      expression: word,
      cursorPosition: word.length,
      kwargs: { skip_formulas: !autocompleteOptions.useSpreadsheetFunctions },
    },
    "globalObject"
  ).then(({ result }) => {
    const options = result.map(({ label, detail, args }) =>
      createAutocompleteOption(
        { label, detail, type: "function", args },
        autocompleteOptions
      )
    );
    return { from: node.from, options };
  });
};

const createAutocompleteOption = (
  { label, detail, type, args }: AutocompleteResponseItem,
  autocompleteOptions: AutocompleteOptions
): Completion => ({
  label,
  detail,
  type,
  apply: (view: EditorView, completion: Completion, from: number, to: number) => {
    view.dispatch({
      changes: {
        from,
        to,
        insert:
          type === "function" && !autocompleteOptions.functionsOnly
            ? `${label}()`
            : label,
      },
      selection: {
        anchor:
          type === "function" && !autocompleteOptions.functionsOnly
            ? from + label.length + 1
            : from + label.length,
      },
      userEvent: "input.complete",
      effects: [{ value: { label, args }, map: () => undefined, is: () => {} }],
    });
  },
});
