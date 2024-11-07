import { KeyBinding } from "@codemirror/view";
import { indentWithTab, insertTab } from "@codemirror/commands";

export const multilineTabIndent: KeyBinding = {
  ...indentWithTab,
  run: (view) => {
    const isMultiline = view.state.doc.lines > 1;
    if (isMultiline) {
      return indentWithTab.run!(view);
    } else {
      insertTab(view);
      return true;
    }
  },
};
