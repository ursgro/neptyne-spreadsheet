import { EditorView } from "@codemirror/view";

const CODEMIRROR_CONTAINER_CLASS = "cm-content";

const CODEMIRROR_SCROLLER_CLASS = "cm-scroller";

export const getCodemirrorContainerFromElement = (element: Element): Element =>
  element.getElementsByClassName(CODEMIRROR_CONTAINER_CLASS)[0];

export const getCodemirrorScrollerFromElement = (element: Element): Element =>
  element.getElementsByClassName(CODEMIRROR_SCROLLER_CLASS)[0];

// https://github.com/codemirror/autocomplete/blob/main/test/webtest-autocomplete.ts#L111
// apparently dispatching events symbol by symbol allows to emulate user input
export const type = (view: EditorView, text: string) => {
  let cur = view.state.selection.main.head;
  view.dispatch({
    changes: { from: cur, insert: text },
    selection: { anchor: cur + text.length },
    userEvent: "input.type",
  });
};
