import { formatNumberToText } from "./formatter";

test.each<[any, string, string, string, string, string]>([
  [0.0, " . ", "  .  ", "   .   ", "   . 0 ", "   .  "],
  [0.1, " .1", "  .1 ", "   .1  ", "   .10 ", "   .1 "],
  [0.12, " .1", "  .12", "   .12 ", "   .12 ", "   .12 "],
  [0.123, " .1", "  .12", "   .123", "   .123", "   .123"],
  [1.0, "1. ", " 1.  ", "  1.   ", "  1. 0 ", "  1.  "],
  [1.1, "1.1", " 1.1 ", "  1.1  ", "  1.10 ", "  1.1 "],
  [1.12, "1.1", " 1.12", "  1.12 ", "  1.12 ", "  1.12 "],
  [1.123, "1.1", " 1.12", "  1.123", "  1.123", "  1.123"],
])("Number", (value, expected1, expected2, expected3, expected4, expected5) => {
  expect(formatNumberToText(value, "?.?")).toBe(expected1);
  expect(formatNumberToText(value, "??.??")).toBe(expected2);
  expect(formatNumberToText(value, "???.???")).toBe(expected3);
  expect(formatNumberToText(value, "???.?0?")).toBe(expected4);
  expect(formatNumberToText(value, "???.?#?")).toBe(expected5);
});
