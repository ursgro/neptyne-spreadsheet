import "./jest-mock-tinygesture";
import { withMatchedBrackets, getCellNumberFormattedValue } from "./RenderTools";

test.each<[string, string]>([
  ["foo", "foo"],
  ["='foo'", "='foo'"],
  ['="foo"', '="foo"'],
  ["=SUM(1, 2", "=SUM(1, 2)"],
  ['=SUM("1', '=SUM("1")'],
  ["=SUM('1", "=SUM('1')"],
  ["=SUM('1')", "=SUM('1')"],
  ["=SUM('(')", "=SUM('(')"],
  ['=f("\'")', '=f("\'")'],
])("withMatchedBrackets(%s) === %s", (value, result) =>
  expect(withMatchedBrackets(value)).toBe(result)
);

test.each<[string, string]>([
  ["5", "5"],
  ["   -4.5    \n\n", "-4.5"],
  ["\t\n\n\n\t", "\t\n\n\n\t"],
  [" ", " "],
])("getCellNumberFormattedValue('%s', {}) === '%s'", (value, result) =>
  expect(getCellNumberFormattedValue(value, {})).toBe(result)
);
