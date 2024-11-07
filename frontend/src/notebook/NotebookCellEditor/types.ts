export type AutocompleteType = "globalObject" | "property";

export interface AutocompleteRequest {
  expression: string;
  cursorPosition: number;
  kwargs?: Record<string, any>;
}

export interface AutocompleteItemArgument {
  name: string;
}

type AutocompleteResponseItemType = "function" | "constant" | "insertion";
export type AutocompleteResponseItem = {
  label: string;
  type: AutocompleteResponseItemType;
  detail?: string;
  args?: AutocompleteItemArgument[];
};
export type AutocompleteResponse = {
  result: AutocompleteResponseItem[];
};
export type AutocompleteHandler = (
  request: AutocompleteRequest,
  type: AutocompleteType
) => Promise<AutocompleteResponse>;
