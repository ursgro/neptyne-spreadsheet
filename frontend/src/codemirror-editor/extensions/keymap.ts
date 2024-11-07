import { historyKeymap } from "@codemirror/commands";
import { closeBracketsKeymap } from "@codemirror/autocomplete";

export const keymapConfig = [...closeBracketsKeymap, ...historyKeymap];
