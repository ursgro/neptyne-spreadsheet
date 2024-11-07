import { formatNumberToText } from "./formatter";

test.each<[any, string, string]>([
  [0, "??/??", " 0/1 "],
  [1.5, "??/??", " 3/2 "],
  [3.4, "??/??", "17/5 "],
  [4.3, "??/??", "43/10"],
  [0, "00/00", "00/01"],
  [1.5, "00/00", "03/02"],
  [3.4, "00/00", "17/05"],
  [4.3, "00/00", "43/10"],
  [0.0, '# ??/"a"?"a"0"a"', "0        a"],
  [0.1, '# ??/"a"?"a"0"a"', "0        a"],
  [0.12, '# ??/"a"?"a"0"a"', "  1/a8a0a"],
  [1.0, '# ??/"a"?"a"0"a"', "1        a"],
  [1.1, '# ??/"a"?"a"0"a"', "1  1/a9a0a"],
  [1.12, '# ??/"a"?"a"0"a"', "1  1/a8a0a"],
])("Fraction suffix: %s, format string: %s, result: %s", (value, fmt, result) =>
  expect(formatNumberToText(value, fmt)).toBe(result)
);
