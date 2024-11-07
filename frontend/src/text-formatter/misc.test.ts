import { formatNumberToText } from "./formatter";

test.each<[any, string, string]>([
  [12.34567, "###.##", "12.35"],
  [12, "000.00", "012.00"],
  [123456789, "#,###", "123,456,789"],
  [355, "YYYY-MM-DD HH:MM:SS", "1900-12-20 00:00:00"],
  [1.5, "# ?/?", "1 1/2"],
  ["xyz", "=== @ ===", "=== xyz ==="],
  [0.123456, "0.00%", "12.35%"],
  [123.456, "0.00E+#", "1.23E+2"],
  [-6789.4, "[$$-409]#,##0.00; -[$$-409]#,##0.00", " -$6,789.40"],
])(
  "Misc text formatting cases: %s, format string: %s, result: %s",
  (value, fmt, result) => expect(formatNumberToText(value, fmt)).toBe(result)
);

test.each<[any, string, string]>([[1469.07, "0,000,000.00", "0,001,469.07"]])(
  "Thousands separator: %s, format string: %s, result: %s",
  (value, fmt, result) => expect(formatNumberToText(value, fmt)).toBe(result)
);

test.each<[any, string, string]>([
  [1234.56, "[$€-1809]# ##0.00", "€1 234.56"],
  [1234.56, "#,##0.00 [$EUR]", "1,234.56 EUR"],
])("Currency: %s, format string: %s, result: %s", (value, fmt, result) =>
  expect(formatNumberToText(value, fmt)).toBe(result)
);
