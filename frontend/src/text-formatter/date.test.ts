import { formatNumberToText } from "./formatter";
import { tzOffsets, mockTz, excelDates } from "../mockTimezone";

const originalDate = global.Date;

afterAll(() => {
  global.Date = originalDate;
});

describe("JS date formatting", () => {
  for (const offset of tzOffsets) {
    test.each<[number[], string, string]>([
      [[2017, 9, 16, 0, 0, 0], "dddd, MMMM d, yyyy", "Monday, October 16, 2017"],
      [[2017, 9, 16, 0, 0, 0], "dddd, MMMMM d, yyyy", "Monday, O 16, 2017"],
      [
        [2017, 9, 16, 0, 0, 0],
        "dddd,,, MMMM d,, yyyy,,,,",
        "Monday, October 16, 2017,",
      ],
      [[2000, 0, 1], "d-mmm-yy", "1-Jan-00"],
      [[2000, 0, 1, 12, 34, 56], "m/d/yyyy\\ h:mm:ss;@", "1/1/2000 12:34:56"],
      [[2010, 8, 26], "yyyy-MMM-dd", "2010-Sep-26"],
      [[2010, 8, 26], "yyyy-MM-dd", "2010-09-26"],
      [[2010, 8, 26], "mm/dd/yyyy", "09/26/2010"],
      [[2010, 8, 26], "m/d/yy", "9/26/10"],
      [[2010, 8, 26, 12, 34, 56, 123], "m/d/yy hh:mm:ss.000", "9/26/10 12:34:56.123"],
      [[2010, 8, 26, 12, 34, 56, 123], "YYYY-MM-DD HH:MM:SS", "2010-09-26 12:34:56"],
      [[2020, 0, 1, 14, 35, 55], "m/d/yyyy\\ h:mm:ss AM/PM;@", "1/1/2020 2:35:55 PM"],
      [[2020, 0, 1, 14, 35, 55], "m/d/yyyy\\ h:mm:ss aM/Pm;@", "1/1/2020 2:35:55 PM"],
      [[2020, 0, 1, 14, 35, 55], "m/d/yyyy\\ h:mm:ss am/PM;@", "1/1/2020 2:35:55 PM"],
      [[2020, 0, 1, 14, 35, 55], "m/d/yyyy\\ h:mm:ss A/P;@", "1/1/2020 2:35:55 P"],
      [[2020, 0, 1, 14, 35, 55], "m/d/yyyy\\ h:mm:ss a/P;@", "1/1/2020 2:35:55 p"],
      [[2020, 0, 1, 14, 35, 55], "m/d/yyyy\\ h:mm:ss A/p;@", "1/1/2020 2:35:55 P"],
      [[2020, 0, 1, 14, 35, 55], "m/d/yyyy\\ h:mm:ss;@", "1/1/2020 14:35:55"],
      [[2020, 0, 1, 14, 35, 55], "m/d/yyyy\\ hh:mm:ss AM/PM;@", "1/1/2020 02:35:55 PM"],
      [[2020, 0, 1, 16, 5, 6], "m/d/yyyy\\ h:m:s AM/PM;@", "1/1/2020 4:5:6 PM"],
      [[2020, 0, 1, 0, 35, 55], "m/d/yyyy\\ hh:mm:ss AM/PM;@", "1/1/2020 12:35:55 AM"],
      [[2020, 0, 1, 12, 35, 55], "m/d/yyyy\\ hh:mm:ss AM/PM;@", "1/1/2020 12:35:55 PM"],
    ])(`Date: %s, fmt: %s, result: %s. TZ: ${offset}`, (value, fmt, result) => {
      mockTz(offset);
      expect(
        // @ts-ignore
        formatNumberToText(excelDates.jsDateToExcelDate(new Date(...value)), fmt)
      ).toBe(result);
    });
  }
});

describe("Excel date formatting", () => {
  for (const offset of tzOffsets) {
    test.each<[any, string, string]>([
      // Date 1900
      ["0", "dd/mm/yyyy", "0"],
      [1, "dd/mm/yyyy", "01/01/1900"],
      [61, "dd/mm/yyyy", "01/03/1900"],
      [43648, "[$-409]d\\-mmm\\-yyyy;@", "2-Jul-2019"],
      [0, "hh:mm", "00:00"],
      [0, "mm:ss", "00:00"],
    ])(`Date: %s, fmt: %s, result: %s. TZ: ${offset}`, (value, fmt, result) => {
      mockTz(offset);
      expect(formatNumberToText(value, fmt)).toBe(result);
    });
  }
});
