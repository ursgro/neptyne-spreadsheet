import { EditorSelection } from "@codemirror/state";
import {
  canSelectWhileEditingRepl,
  canSelectWhileEditingSheet,
} from "./can-select-while-editing";
import { CurrentCellContent } from "./NeptyneSheet";

const defaultCurrentCellValue: CurrentCellContent = {
  value: "",
  row: 1,
  col: 1,
  dynamicContentStart: 0,
  dynamicContentEnd: 0,
  editorSelection: EditorSelection.single(0),
};

test.each<[CurrentCellContent | undefined, boolean]>([
  [undefined, false],
  [defaultCurrentCellValue, false],
  [{ ...defaultCurrentCellValue, value: "=", dynamicContentStart: 1 }, true],
  [{ ...defaultCurrentCellValue, value: "=", dynamicContentStart: 0 }, false],
  [{ ...defaultCurrentCellValue, value: "=1", dynamicContentStart: 2 }, false],
  [{ ...defaultCurrentCellValue, value: "=foo", dynamicContentStart: 4 }, false],
  [{ ...defaultCurrentCellValue, value: "=foo.", dynamicContentStart: 5 }, false],
  [{ ...defaultCurrentCellValue, value: "='", dynamicContentStart: 2 }, false],
  [{ ...defaultCurrentCellValue, value: "=SUM(", dynamicContentStart: 5 }, true],
  [{ ...defaultCurrentCellValue, value: "=SUM()", dynamicContentStart: 5 }, true],
  [{ ...defaultCurrentCellValue, value: "=foo.bar", dynamicContentStart: 8 }, false],
  [{ ...defaultCurrentCellValue, value: "=foo.bar ", dynamicContentStart: 9 }, false],
  [{ ...defaultCurrentCellValue, value: "=foo.bar +", dynamicContentStart: 10 }, true],
  [{ ...defaultCurrentCellValue, value: "=``", dynamicContentStart: 1 }, false],
  [{ ...defaultCurrentCellValue, value: "=``", dynamicContentStart: 2 }, false],
  [{ ...defaultCurrentCellValue, value: "=`", dynamicContentStart: 2 }, false],
  [{ ...defaultCurrentCellValue, value: "=``", dynamicContentStart: 3 }, false],
  [{ ...defaultCurrentCellValue, value: "=''", dynamicContentStart: 1 }, false],
  [{ ...defaultCurrentCellValue, value: "=''", dynamicContentStart: 2 }, false],
  [{ ...defaultCurrentCellValue, value: "='", dynamicContentStart: 2 }, false],
  [{ ...defaultCurrentCellValue, value: "=''", dynamicContentStart: 3 }, false],
  [{ ...defaultCurrentCellValue, value: '=""', dynamicContentStart: 1 }, false],
  [{ ...defaultCurrentCellValue, value: '=""', dynamicContentStart: 2 }, false],
  [{ ...defaultCurrentCellValue, value: '="', dynamicContentStart: 2 }, false],
  [{ ...defaultCurrentCellValue, value: '=""', dynamicContentStart: 3 }, false],
  [{ ...defaultCurrentCellValue, value: '="test"', dynamicContentStart: 2 }, false],
  [{ ...defaultCurrentCellValue, value: '="test"', dynamicContentStart: 3 }, false],
  [{ ...defaultCurrentCellValue, value: '="test"', dynamicContentStart: 6 }, false],
  [{ ...defaultCurrentCellValue, value: '="test12"', dynamicContentStart: 6 }, false],
  [{ ...defaultCurrentCellValue, value: '="test12"', dynamicContentStart: 7 }, false],
  [{ ...defaultCurrentCellValue, value: '="test12"', dynamicContentStart: 8 }, false],
  [{ ...defaultCurrentCellValue, value: '="12test"', dynamicContentStart: 2 }, false],
  [{ ...defaultCurrentCellValue, value: '="12test"', dynamicContentStart: 4 }, false],
  [{ ...defaultCurrentCellValue, value: '="__"', dynamicContentStart: 2 }, false],
  [{ ...defaultCurrentCellValue, value: '="test___"', dynamicContentStart: 5 }, false],
])(
  "canSelectWhileEditingSheet should accept %s and return %s ",
  (currentCellValue: CurrentCellContent | undefined, canSelect: boolean) => {
    expect(canSelectWhileEditingSheet(currentCellValue)).toBe(canSelect);
  }
);

test.each<[CurrentCellContent, boolean]>([
  [defaultCurrentCellValue, false],
  [{ ...defaultCurrentCellValue, value: "", dynamicContentStart: 0 }, false],
  [{ ...defaultCurrentCellValue, value: "1", dynamicContentStart: 1 }, false],
  [{ ...defaultCurrentCellValue, value: "foo", dynamicContentStart: 3 }, false],
  [{ ...defaultCurrentCellValue, value: "foo.", dynamicContentStart: 4 }, false],
  [{ ...defaultCurrentCellValue, value: "'", dynamicContentStart: 1 }, false],
  [{ ...defaultCurrentCellValue, value: "SUM(", dynamicContentStart: 4 }, true],
  [{ ...defaultCurrentCellValue, value: "SUM()", dynamicContentStart: 4 }, true],
  [{ ...defaultCurrentCellValue, value: "foo.bar", dynamicContentStart: 7 }, false],
  [{ ...defaultCurrentCellValue, value: "foo.bar ", dynamicContentStart: 8 }, false],
  [{ ...defaultCurrentCellValue, value: "foo.bar +", dynamicContentStart: 9 }, true],
  [{ ...defaultCurrentCellValue, value: "``", dynamicContentStart: 0 }, false],
  [{ ...defaultCurrentCellValue, value: "``", dynamicContentStart: 1 }, false],
  [{ ...defaultCurrentCellValue, value: "`", dynamicContentStart: 1 }, false],
  [{ ...defaultCurrentCellValue, value: "``", dynamicContentStart: 2 }, false],
  [{ ...defaultCurrentCellValue, value: "''", dynamicContentStart: 0 }, false],
  [{ ...defaultCurrentCellValue, value: "''", dynamicContentStart: 1 }, false],
  [{ ...defaultCurrentCellValue, value: "'", dynamicContentStart: 1 }, false],
  [{ ...defaultCurrentCellValue, value: "''", dynamicContentStart: 2 }, false],
  [{ ...defaultCurrentCellValue, value: '""', dynamicContentStart: 0 }, false],
  [{ ...defaultCurrentCellValue, value: '""', dynamicContentStart: 1 }, false],
  [{ ...defaultCurrentCellValue, value: '"', dynamicContentStart: 1 }, false],
  [{ ...defaultCurrentCellValue, value: '""', dynamicContentStart: 2 }, false],
  [{ ...defaultCurrentCellValue, value: '"test"', dynamicContentStart: 1 }, false],
  [{ ...defaultCurrentCellValue, value: '"test"', dynamicContentStart: 2 }, false],
  [{ ...defaultCurrentCellValue, value: '"test"', dynamicContentStart: 5 }, false],
  [{ ...defaultCurrentCellValue, value: '"test12"', dynamicContentStart: 5 }, false],
  [{ ...defaultCurrentCellValue, value: '"test12"', dynamicContentStart: 6 }, false],
  [{ ...defaultCurrentCellValue, value: '"test12"', dynamicContentStart: 7 }, false],
  [{ ...defaultCurrentCellValue, value: '"12test"', dynamicContentStart: 1 }, false],
  [{ ...defaultCurrentCellValue, value: '"12test"', dynamicContentStart: 3 }, false],
  [{ ...defaultCurrentCellValue, value: '"__"', dynamicContentStart: 1 }, false],
  [{ ...defaultCurrentCellValue, value: '"test___"', dynamicContentStart: 4 }, false],
])(
  "canSelectWhileEditingRepl should accept %s and return %s ",
  (currentCellValue: CurrentCellContent, canSelect: boolean) => {
    expect(
      canSelectWhileEditingRepl(
        currentCellValue.value,
        currentCellValue.dynamicContentStart
      )
    ).toBe(canSelect);
  }
);
