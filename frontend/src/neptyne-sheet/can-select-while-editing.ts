import { pythonLanguage } from "@codemirror/lang-python";
import { SyntaxNode } from "@lezer/common";

import { CurrentCellContent } from "./NeptyneSheet";
import { isFormulaValue } from "../SheetUtils";

export const canSelectWhileEditingSheet = (
  currentCellContent?: CurrentCellContent,
  isSelectingWhileEditing?: boolean
): boolean => {
  if (
    !isValidCellContent(currentCellContent) ||
    currentCellContent.lastUserMovementSource === "keyboard"
  ) {
    return false;
  }
  let { value: expression, dynamicContentStart: cursorPosition } = currentCellContent;

  [expression, cursorPosition] = clearEqualSign(expression, cursorPosition);

  return canSelectWhileEditing(expression, cursorPosition, isSelectingWhileEditing);
};

export const canSelectWhileEditingRepl = (
  expression: string,
  cursorPosition: number,
  isSelectingWhileEditing?: boolean
): boolean =>
  !!expression.length &&
  canSelectWhileEditing(expression, cursorPosition, isSelectingWhileEditing);

export const canSelectWhileEditing = (
  expression: string,
  cursorPosition: number,
  isSelectingWhileEditing?: boolean
): boolean => {
  // AST treats whitespaces as separate nodes, and it does it in a really weird way.
  // So for this check we remove whitespaces and readjust whitespaces
  [expression, cursorPosition] = clearWhitespaces(expression, cursorPosition);

  const node: SyntaxNode = pythonLanguage.parser
    .parse(expression)
    .resolveInner(cursorPosition, -1);

  const isAlphaNumericOrQuote = new RegExp("^[\\w\"'`]+$");
  const leftPart = expression.slice(0, cursorPosition); // expression to the left of the cursor
  const rightPart = expression.substring(cursorPosition); // expression to the right of the cursor

  if (
    ["String", "VariableName", ".", "Number", "PropertyName", ")", "]", "}"].includes(
      node.name
    )
  ) {
    return false;
  } else if (
    // do not allow cell-id selection if alphanumeric or quote character is before the cursor
    // OR if alphanumeric or quote character is after the cursor
    !isSelectingWhileEditing &&
    ((leftPart.length > 0 && isAlphaNumericOrQuote.test(leftPart.slice(-1))) ||
      (rightPart.length > 0 && isAlphaNumericOrQuote.test(rightPart.charAt(0))))
  ) {
    return false;
  }

  return true;
};

const isValidCellContent = (
  currentCellContent?: CurrentCellContent
): currentCellContent is CurrentCellContent => {
  // you cannot initiate selection when no cell is focused
  if (!currentCellContent) {
    return false;
  }
  const { value, dynamicContentStart } = currentCellContent;
  // you cannot initiate selection when cell has no Python code in it
  // or if the cursor is before "="
  if (!value || !isFormulaValue(value) || dynamicContentStart === 0) {
    return false;
  }
  return true;
};

const clearEqualSign = (
  expression: string,
  cursorPosition: number
): [expression: string, cursorPosition: number] => {
  return [expression.substring(1), cursorPosition - 1];
};

const clearWhitespaces = (
  expression: string,
  cursorPosition: number
): [expression: string, cursorPosition: number] => {
  const expressionWhithoutWhitespaces = expression.replace(/\s+/g, "");
  const expressionWhithoutWhitespacesCursorPosition =
    cursorPosition - (expression.substring(0, cursorPosition).split(" ").length - 1);
  return [expressionWhithoutWhitespaces, expressionWhithoutWhitespacesCursorPosition];
};
