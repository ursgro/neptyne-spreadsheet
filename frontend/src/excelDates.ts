import { format as fnsFormat } from "date-fns";
import {
  MILLISECONDS_IN_A_DAY,
  MILLISECONDS_IN_AN_HOUR,
  MILLISECONDS_IN_A_MINUTE,
  MILLISECONDS_IN_A_SECOND,
} from "./text-formatter/timespan";

const EPOCH_FIRST_YEAR = 1900;
export const MIN_EXCEL_DATE = new Date(EPOCH_FIRST_YEAR - 1, 11, 31);

const INIT_DATE = new Date(EPOCH_FIRST_YEAR, 0, 1);
const FEB_28_1900 = new Date(EPOCH_FIRST_YEAR, 1, 28);

function correctNumberOfDays(_date: Date): number {
  if (_date > FEB_28_1900) return 1;
  else if (_date < INIT_DATE) return -1;
  return 0;
}

// https://stackoverflow.com/questions/70804856/convert-javascript-date-object-to-excel-serial-date-number
// https://stackoverflow.com/questions/56551022/convert-date-dd-mm-yyyy-to-excel-serial-number-in-javascript
export function jsDateToExcelDate(date: Date) {
  const days = new Date(date);
  let days_serial =
    Math.round(
      (days.setHours(0, 0, 0, 0) - MIN_EXCEL_DATE.getTime()) / MILLISECONDS_IN_A_DAY
    ) + correctNumberOfDays(date);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  const milliseconds = date.getMilliseconds();

  if (hours || minutes || seconds || milliseconds) {
    days_serial +=
      (hours * MILLISECONDS_IN_AN_HOUR +
        minutes * MILLISECONDS_IN_A_MINUTE +
        seconds * MILLISECONDS_IN_A_SECOND +
        milliseconds) /
      MILLISECONDS_IN_A_DAY;
  }
  return days_serial;
}

// Adapted from:https://stackoverflow.com/questions/16229494/converting-excel-date-serial-number-to-date-using-javascript
export function excelDateToJSDate(serial: number) {
  const MAGIC_NUMBER_OF_DAYS = 25569 + (serial < 0 ? -2 : serial < 61 ? -1 : 0);
  const delta = serial - MAGIC_NUMBER_OF_DAYS;
  const parsed = delta * MILLISECONDS_IN_A_DAY;
  const dateInfo = new Date(parsed);
  const fractionalDay = serial - Math.floor(serial) + 0.000000001;

  const millisecInDay = Math.floor(MILLISECONDS_IN_A_DAY * fractionalDay);
  const secondsInDay = Math.floor(86400 * fractionalDay);

  const seconds = secondsInDay % 60;
  const minutesInDay = Math.floor(secondsInDay / 60);

  const hours = Math.floor(minutesInDay / 60);
  const minutes = Math.floor(minutesInDay) % 60;
  const milliseconds = Math.floor(millisecInDay % MILLISECONDS_IN_A_SECOND);

  return new Date(
    dateInfo.getUTCFullYear(),
    dateInfo.getUTCMonth(),
    dateInfo.getUTCDate(),
    hours,
    minutes,
    seconds,
    milliseconds
  );
}

export const formatDate = (date: Date, format?: string): string => {
  if (!format) {
    return date.toDateString();
  }
  try {
    return fnsFormat(date, format);
  } catch (RangeError) {
    // if an error will be raised because of not allowed values,
    // we will simply return the value from the excelDateToJSDate function
    return date.toDateString();
  }
};
