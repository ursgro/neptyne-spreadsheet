import { parse } from "date-fns";
import { tzOffsets, mockTz, excelDates } from "./mockTimezone";

const originalDate = global.Date;
afterAll(() => {
  global.Date = originalDate;
});

test.each<number>(tzOffsets)(
  "Converts Excel Dates back and forth. TZ: %s",
  (offset) => {
    mockTz(offset);
    const date = new Date(2022, 3, 14);
    const excelDate = excelDates.jsDateToExcelDate(date);
    const backAgain = excelDates.excelDateToJSDate(excelDate);
    expect(backAgain).toEqual(date);
  }
);

test.each<number>(tzOffsets)(
  "Knows about the beginning of the Excel epoch. TZ: %s",
  (offset) => {
    mockTz(offset);
    const excelEpoch = excelDates.jsDateToExcelDate(excelDates.MIN_EXCEL_DATE);
    expect(excelEpoch).toEqual(-1);
  }
);

test.each<number>(tzOffsets)("Some known Excel dates. TZ: %s", (offset) => {
  mockTz(offset);
  for (const testPair of [
    { excel: 44816, js: "09/12/2022" },
    { excel: -1, js: "12/31/1899" },
    { excel: 100, js: "04/09/1900" },
    { excel: 1000, js: "09/26/1902" },
    { excel: 40447, js: "09/26/2010" },
    { excel: 36526, js: "01/01/2000" },
  ]) {
    const jsDate = parse(testPair.js, "MM/dd/yyyy", excelDates.MIN_EXCEL_DATE);
    expect(excelDates.excelDateToJSDate(testPair.excel)).toEqual(jsDate);
    expect(excelDates.jsDateToExcelDate(jsDate)).toEqual(testPair.excel);
  }
});
