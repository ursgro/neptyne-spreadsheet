import { formatNumberToText } from "./formatter";
import {
  TimeSpan,
  MILLISECONDS_IN_A_DAY,
  MILLISECONDS_IN_A_SECOND,
  MILLISECONDS_IN_A_MINUTE,
  MILLISECONDS_IN_AN_HOUR,
} from "./timespan";

test.each<[any, string, string]>([
  [0, "[hh]:mm", "00:00"],
  [1, "[hh]:mm", "24:00"],
  [1.5, "[hh]:mm", "36:00"],
])("Duration: %s, format string: %s, result: %s", (value, fmt, result) =>
  expect(formatNumberToText(value, fmt)).toBe(result)
);

test.each<[any, string, string]>([
  [new TimeSpan(MILLISECONDS_IN_AN_HOUR * 100), "[hh]:mm:ss", "100:00:00"],
  [new TimeSpan(MILLISECONDS_IN_AN_HOUR * 100), "[mm]:ss", "6000:00"],
  [new TimeSpan(100 * 60 * 60 * 1000 + 123), "[mm]:ss.000", "6000:00.123"],
  [
    new TimeSpan(
      MILLISECONDS_IN_A_DAY +
        MILLISECONDS_IN_AN_HOUR * 2 +
        MILLISECONDS_IN_A_MINUTE * 31 +
        MILLISECONDS_IN_A_SECOND * 45
    ),
    "[hh]:mm:ss",
    "26:31:45",
  ],
  [
    new TimeSpan(
      MILLISECONDS_IN_A_DAY +
        MILLISECONDS_IN_AN_HOUR * 2 +
        MILLISECONDS_IN_A_MINUTE * 31 +
        MILLISECONDS_IN_A_SECOND * 44 +
        500
    ),
    "[hh]:mm:ss",
    "26:31:45",
  ],
  [
    new TimeSpan(
      MILLISECONDS_IN_A_DAY +
        MILLISECONDS_IN_AN_HOUR * 2 +
        MILLISECONDS_IN_A_MINUTE * 31 +
        MILLISECONDS_IN_A_SECOND * 44 +
        500
    ),
    "[hh]:mm:ss.000",
    "26:31:44.500",
  ],
  [
    new TimeSpan(
      -(
        MILLISECONDS_IN_A_DAY +
        MILLISECONDS_IN_AN_HOUR * 2 +
        MILLISECONDS_IN_A_MINUTE * 31 +
        MILLISECONDS_IN_A_SECOND * 45
      )
    ),
    "[hh]:mm:ss",
    "-26:31:45",
  ],
  [
    new TimeSpan(
      -(
        MILLISECONDS_IN_AN_HOUR * 2 +
        MILLISECONDS_IN_A_MINUTE * 31 +
        MILLISECONDS_IN_A_SECOND * 45
      )
    ),
    "[hh]:mm:ss",
    "-02:31:45",
  ],
  [
    new TimeSpan(
      -(
        MILLISECONDS_IN_AN_HOUR * 2 +
        MILLISECONDS_IN_A_MINUTE * 31 +
        MILLISECONDS_IN_A_SECOND * 44 +
        500
      )
    ),
    "[hh]:mm:ss",
    "-02:31:45",
  ],
  [
    new TimeSpan(
      -(
        MILLISECONDS_IN_AN_HOUR * 2 +
        MILLISECONDS_IN_A_MINUTE * 31 +
        MILLISECONDS_IN_A_SECOND * 44 +
        500
      )
    ),
    "[hh]:mm:ss.000",
    "-02:31:44.500",
  ],
])("Duration with delta: %s, format string: %s, result: %s", (value, fmt, result) =>
  expect(formatNumberToText(value.totalMilliSeconds / MILLISECONDS_IN_A_DAY, fmt)).toBe(
    result
  )
);
