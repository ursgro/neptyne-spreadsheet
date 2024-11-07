import { Tokenizer } from "./tokenizer";

test.each<[string, number]>([
  ["123", 3],
  ["hello", 5],
  ["", 0],
])("Tokenizer.length str %s", (str, result) =>
  expect(new Tokenizer(str).length()).toBe(result)
);

test.each<[string, number, number, string]>([
  ["Neptyne Sheet", 0, 7, "Neptyne"],
  ["", 5, 6, ""],
])(
  "Tokenizer.substring str %s start_index %d length %d",
  (str, start_ind, length, result) =>
    expect(new Tokenizer(str).substring(start_ind, length)).toBe(result)
);

test.each<[string, number, string | number]>([
  ["Neptyne", 2, "p"],
  ["", 12, -1],
])("Tokenizer.peek str %s offset %d", (str, offset, result) =>
  expect(new Tokenizer(str).peek(offset)).toBe(result)
);

test.each<[string, number, string, number]>([
  ["Neptyne", 2, "y", 3],
  ["Neptyne", 0, "y", 5],
  ["Neptyne", 0, "B", 0],
  ["", 0, "e", 0],
])(
  "Tokenizer.peek_until str %s start_offset %d until %d",
  (str, start_offset, until, result) =>
    expect(new Tokenizer(str).peekUntil(start_offset, until)).toBe(result)
);

test.each<[string, number, string, boolean]>([
  ["Neptyne", 2, "abcp", true],
  ["", 2, "e", false],
  ["", 0, "", false],
])("Tokenizer.peek_one_of str %s offset %d s %s", (str, offset, s, result) =>
  expect(new Tokenizer(str).peekOneOf(offset, s)).toBe(result)
);

test.each<[string, string, boolean]>([
  ["yyy", "y", true],
  ["yyy", "x", false],
])("Tokenizer.read_one_or_more str %s char %s", (str, s, result) =>
  expect(new Tokenizer(str).readOneOrMore(s)).toBe(result)
);

test.each<[string, string, boolean]>([
  ["yyy", "cvy", true],
  ["yyy", "xwe", false],
])("Tokenizer.read_one_of str %s s %s", (str, s, result) =>
  expect(new Tokenizer(str).readOneOf(s)).toBe(result)
);

test.each<[string, string, boolean, boolean]>([
  ["NEPTYNE", "neptyne", true, true],
  ["NEPTYNE", "neptyne", false, false],
  ["Neptyne sheet", "n", false, false],
])("Tokenizer.read_string str %s s %s ignore_case %d", (str, s, ignore_case, result) =>
  expect(new Tokenizer(str).readString(s, ignore_case)).toBe(result)
);

test.each<[string, string, string, boolean]>([
  ["NEPTYNE", "N", "P", true],
  ["Neptyne", "N", "z", false],
  ["Neptyne", "p", "y", false],
])(
  "Tokenizer.read_enclosed str %s char_open %s char_close %s",
  (str, char_open, char_close, result) =>
    expect(new Tokenizer(str).readEnclosed(char_open, char_close)).toBe(result)
);
