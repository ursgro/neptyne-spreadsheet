import * as ExcelDates from "./excelDates";

const timezonedDate = require("timezoned-date");

export const tzOffsets = Array.from({ length: 27 }, (_, i) => -12 + i);
export let excelDates: typeof ExcelDates;

export function mockTz(offset_in_hours: number) {
  global.Date = timezonedDate.makeConstructor(offset_in_hours * 60);
  jest.resetModules();
  excelDates = require("./excelDates");
}
