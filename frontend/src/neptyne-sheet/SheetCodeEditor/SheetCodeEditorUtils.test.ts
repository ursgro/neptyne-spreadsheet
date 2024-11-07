import { looksLikePythonCode } from "./sheetCodeEditorUtils";

test.each<[string, boolean]>([
  ["assert A", true],
  ["insert a table into A", false],
  ["def double", true],
  ['print("Hello, world!")', true],
  ["if x > 5:", true],
  ["open the door", false],
  ["sum = 0", true],
  ["for i in range(10):", true],
  ["break the loop", false],
  ["import the module", true],
  ["import the module for", false],
  ["raise the bar", true],
  ["raise the bar higher", false],
  ["return to sender", true],
  ["return to sender address unknown", false],
  ["for i in Sheet1!A1:A10:\n\tprint(i)", true],
  ["for i in my_str[::-1]:\n\tprint(i)", true],
  ["for i in Sheet1!A1:A10[::-1]:\n\tprint(i)", true],
  ["foo(A1:A10)", true],
  ["foo(A1:A10, B1:B, C1, D2:D)", true],
  ["%matplotlib inline", true],
  ["!pip install numpy", true],
  ["r[2:4].clear()", true],
  ["for i in range(10):\n\ta[::2] = a[abc]", true],
])("Should use python extension(%s, %s, %s)", (expression, result) => {
  expect(looksLikePythonCode(expression)).toBe(result);
});
