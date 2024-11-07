import {
  isExponent,
  isLiteral,
  isPlaceholder,
  isNumberLiteral,
  isGeneral,
  isDurationPart,
  isDatePart,
  isDigit09,
  isDigit19,
} from "./token";

test.each<[string, boolean]>([
  ["e+", true],
  ["e-", true],
  ["E+", true],
  ["E-", true],
  ["e", false],
  ["-e", false],
  ["E", false],
])("is_exponent token %s", (token, result) => expect(isExponent(token)).toBe(result));

test.each<[string, boolean]>([
  ["_l", true],
  ["\\l", true],
  ['"l', true],
  ["*l", true],
  ["!", true],
  [",", true],
  ["&", true],
  [" ", true],
  ["  ", false],
  ["___", true],
])("is_literal token %s", (token, result) => expect(isLiteral(token)).toBe(result));

test.each<[string, boolean]>([
  ["0", true],
  ["#", true],
  ["?", true],
  ["*", false],
  ["a", false],
  ["", false],
])("is_placeholder token %s", (token, result) =>
  expect(isPlaceholder(token)).toBe(result)
);

test.each<[string, boolean]>([
  ["0", true],
  ["#", true],
  ["?", true],
  [".", true],
  ["1", true],
  ["a", false],
])("is_number_literal token %s", (token, result) =>
  expect(isNumberLiteral(token)).toBe(result)
);

test.each<[string, boolean]>([
  ["general", true],
  ["a", false],
])("is_general token %s", (token, result) => expect(isGeneral(token)).toBe(result));

test.each<[string, boolean]>([
  ["[hh", true],
  ["[mm", true],
  ["[ss", true],
  ["[[", false],
  ["hh", false],
])("is_duration_part token %s", (token, result) =>
  expect(isDurationPart(token)).toBe(result)
);

test.each<[string, boolean]>([
  ["am/pm", true],
  ["AM/PM", true],
  ["a/p", true],
  ["A/P", true],
  ["[hh", true],
  ["y", true],
  ["m", true],
  ["d", true],
  ["s", true],
  ["h", true],
  ["g", true],
  ["a", false],
])("is_date_part token %s", (token, result) => expect(isDatePart(token)).toBe(result));

test.each<[string, boolean]>([
  ["1", true],
  ["0", true],
  ["5", true],
  ["9", true],
  ["a", false],
])("is_digit_09 token %s", (token, result) => expect(isDigit09(token)).toBe(result));

test.each<[string, boolean]>([
  ["1", true],
  ["0", false],
  ["5", true],
  ["9", true],
  ["a", false],
])("is_digit_09 token %s", (token, result) => expect(isDigit19(token)).toBe(result));
