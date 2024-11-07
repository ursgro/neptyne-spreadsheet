export interface Format {
  [key: string]: string;
}

export interface DateFormat {
  Date: Format;
  Time: Format;
  ["Date and Time"]: Format;
}

// Menu title: format
export const DATE_CONTROL_FORMATS: DateFormat = {
  Date: {
    "MM/DD/YYYY": "MM/dd/yyyy",
    "MM/DD/YY": "MM/dd/yy",
    "MM-DD-YYYY": "MM-dd-yyyy",
    "DD.MM.YY": "dd.MM.yy",
    "Mon DD, YYYY": "MMM dd, yyyy",
  },
  Time: {
    "HH:MM": "hh:mm",
    "HH:MM PM": "hh:mm a",
    "HH:MM:SS": "hh:mm:ss",
    "HH:MM:SS PM": "hh:mm:ss a",
  },
  "Date and Time": {
    "Mon DD, YYYY HH:MM": "MMM dd, yyyy hh:mm",
    "Mon DD, YYYY HH:MM PM": "MMM dd, yyyy hh:mm a",
    "Month DD, YYYY HH:MM": "MMMM dd, yyyy hh:mm",
    "Month DD, YYYY HH:MM PM": "MMMM dd, yyyy hh:mm a",
  },
};
export const DATE_FORMATS = [
  "MM/dd/yyyy",
  "MM/dd/yy",
  "MM-dd-yyyy",
  "dd.MM.yy",
  "MMM dd, yyyy",
  "MMM dd, yyyy hh:mm",
  "MMM dd, yyyy hh:mm a",
  "MMMM dd, yyyy hh:mm",
  "MMMM dd, yyyy hh:mm a",
];
export const TIME_FORMATS = ["hh:mm", "hh:mm a", "hh:mm:ss", "hh:mm:ss a"];
export const DEFAULT_DATE_FORMAT = DATE_CONTROL_FORMATS.Date["MM/DD/YYYY"];
export const DEFAULT_TIME_FORMAT = DATE_CONTROL_FORMATS.Time["HH:MM"];
