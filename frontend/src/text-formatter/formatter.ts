import { isDatePart, isGeneral, isPlaceholder } from "./token";
import { TimeSpan, MILLISECONDS_IN_A_DAY } from "./timespan";
import { Section } from "./section";
import { DecimalSection } from "./decimal_section";
import { NumberFormat } from "./number_format";
import { getSection } from "./evaluator";
import { SectionType } from "./section_type";
import { excelDateToJSDate } from "../excelDates";
import { format } from "date-fns";
import Decimal from "decimal.js";

// Formatter is adapted from the C# repo: https://github.com/andersnm/ExcelNumberFormat

function lookAheadDatePart(
  tokens: string[],
  from_ind: number,
  starts_with: string
): boolean {
  starts_with = starts_with.toLowerCase();
  for (const token of tokens.slice(from_ind)) {
    if (token.toLowerCase().startsWith(starts_with)) return true;
    if (isDatePart(token)) return false;
  }
  return false;
}

function lookBackDatePart(
  tokens: string[],
  from_ind: number,
  starts_with: string
): boolean {
  starts_with = starts_with.toLowerCase();
  for (let i = from_ind; i >= 0; i--) {
    const token = tokens[i];
    if (token.toLowerCase().startsWith(starts_with)) return true;
    if (isDatePart(token)) return false;
  }
  return false;
}

function containsAmPm(tokens: string[]): boolean {
  for (let token of tokens) {
    token = token.toLowerCase();
    if (token === "am/pm" || token === "a/p") return true;
  }
  return false;
}

function formatLiteral(token: string, result: string[]) {
  let literal = "";
  if (token !== ",") {
    // skip commas
    if (token.length === 2 && (token[0] === "*" || token[0] === "\\"))
      literal = token[1];
    else if (token.length === 2 && token[0] === "_") literal = " ";
    else if (token.startsWith('"')) literal = token.slice(1, -1);
    else literal = token;
  }
  result.push(literal);
}

function formatDate(date: Date, tokens: string[]) {
  const has_ampm = containsAmPm(tokens);
  let result = [];
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i];
    const ltoken = token.toLowerCase();
    if (ltoken.startsWith("y")) {
      // year
      let digits = ltoken.length;
      if (digits < 2) digits = 2;
      else if (digits === 3) digits = 4;
      let year = date.getFullYear();
      if (digits === 2) year %= 100;
      result.push(year.toString().padStart(digits, "0"));
    } else if (ltoken.startsWith("m")) {
      // If "m" or "mm" code is used immediately after the "h" or "hh" code (for hours) or immediately before
      // the "ss" code (for seconds), the application shall display minutes instead of the month.
      const digits = ltoken.length;
      if (
        lookBackDatePart(tokens, i - 1, "h") ||
        lookAheadDatePart(tokens, i + 1, "s")
      ) {
        result.push(date.getMinutes().toString().padStart(digits, "0"));
      } else {
        let month: string;
        if (digits === 3) month = format(date, "LLL");
        else if (digits === 4) month = format(date, "LLLL");
        else if (digits === 5) month = format(date, "LLLLL");
        else month = (date.getMonth() + 1).toString().padStart(digits, "0");
        result.push(month);
      }
    } else if (ltoken.startsWith("d")) {
      const digits = ltoken.length;
      let day: string;
      if (digits === 3)
        /// Sun-Sat
        day = format(date, "eeee");
      else if (digits === 4)
        /// Sunday-Saturday
        day = format(date, "EEEE");
      else day = date.getDate().toString().padStart(digits, "0");
      result.push(day);
    } else if (ltoken.startsWith("h")) {
      const digits = ltoken.length;
      const hours = has_ampm ? ((date.getHours() + 11) % 12) + 1 : date.getHours();
      result.push(hours.toString().padStart(digits, "0"));
    } else if (ltoken.startsWith("s"))
      result.push(
        date
          .getSeconds()
          .toLocaleString(undefined, { minimumIntegerDigits: ltoken.length })
      );
    else if (ltoken === "am/pm") result.push(date.getHours() >= 12 ? "PM" : "AM");
    else if (ltoken === "a/p") {
      let ampm = date.getHours() >= 12 ? "P" : "A";
      result.push(token[0] === ltoken[0] ? ampm.toLowerCase() : ampm);
    } else if (ltoken.startsWith(".0")) {
      let value = date.getMilliseconds();
      result.push(
        "." +
          value.toLocaleString(undefined, { minimumIntegerDigits: token.length - 1 })
      );
    } else if (token === "/") result.push(token);
    else if (token === ",") {
      while (i < tokens.length - 1 && tokens[i + 1] === ",") ++i;
      result.push(token);
    } else formatLiteral(token, result);
    ++i;
  }
  return result.join("");
}

function formatGeneralText(text: string, tokens: string[]): string {
  let result: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (isGeneral(token) || token === "@") result.push(text);
    else formatLiteral(token, result);
  }
  return result.join("");
}

function formatTimespan(timespan: TimeSpan, tokens: string[]) {
  let result: string[] = [];
  let contains_milliseconds = false;

  for (const token of [...tokens].reverse())
    if (token.startsWith(".0")) {
      contains_milliseconds = true;
      break;
    }
  for (const token of tokens) {
    const ltoken = token.toLowerCase();
    if (ltoken.startsWith("m")) {
      const value = Math.abs(timespan.minutes);
      result.push(value.toString().padStart(token.length, "0"));
    } else if (ltoken.startsWith("s")) {
      // If format does not include ms, then include ms in seconds and round before printing
      const format_ms = contains_milliseconds ? 0 : timespan.milliseconds / 1000;
      const value = Math.round(Math.abs(timespan.seconds + format_ms));
      result.push(value.toString().padStart(token.length, "0"));
    } else if (ltoken.startsWith("[h")) {
      const sgn = timespan.totalMilliSeconds < 0 ? "-" : "";
      const total_hours: number = Math.abs(timespan.totalHours);
      result.push(sgn + total_hours.toString().padStart(token.length - 2, "0"));
      timespan = new TimeSpan(timespan.totalMilliSeconds % (3600 * 1000));
    } else if (ltoken.startsWith("[m")) {
      result.push(
        Math.abs(timespan.totalMinutes)
          .toString()
          .padStart(token.length - 2, "0")
      );
      timespan = new TimeSpan((timespan.seconds % 60) * 1000 + timespan.milliseconds);
    } else if (ltoken.startsWith("[s")) {
      result.push(
        Math.abs(timespan.seconds)
          .toString()
          .padStart(token.length - 2, "0")
      );
      timespan = new TimeSpan(timespan.milliseconds);
    } else if (token.startsWith(".0"))
      result.push(
        "." +
          Math.abs(timespan.milliseconds)
            .toString()
            .padStart(token.length - 1, "0")
      );
    else formatLiteral(token, result);
  }
  return result.join("");
}

function getZeroCount(tokens: string[]): number {
  return tokens.filter((v) => v === "0").length;
}

function getDigitCount(tokens: string[]): number {
  return tokens.filter((v) => isPlaceholder(v)).length;
}

function formatPlaceholder(
  token: string,
  c: string,
  significant: boolean,
  result: string[]
) {
  if (token === "0") {
    if (significant) result.push(c);
    else result.push("0");
  } else if (token === "#") {
    if (significant) result.push(c);
  } else if (token === "?") {
    if (significant) result.push(c);
    else result.push(" ");
  }
}

function getLeftAlignedValueDigit(
  token: string,
  value_str: string,
  start_ind: number,
  significant: boolean
): [string, number] {
  let value_ind = start_ind;
  let c: string;
  if (value_ind < value_str.length) {
    c = value_str[value_ind++];
    if (c !== "0") significant = true;
    if (token === "?" && !significant) {
      // Eat insignificant zeros to left align denominator
      while (value_ind < value_str.length) {
        c = value_str[value_ind++];
        if (c !== "0") break;
      }
    }
  } else c = "0";
  return [c, value_ind];
}

function formatDenominator(value_str: string, tokens: string[], result: string[]) {
  const format_digits = getDigitCount(tokens);
  value_str = value_str.padStart(format_digits, "0");
  let significant = false;
  let value_ind = 0;
  for (let token_ind = 0; token_ind < tokens.length; token_ind++) {
    const token = tokens[token_ind];
    let c: string = "";
    if (value_ind < value_str.length) {
      [c, value_ind] = getLeftAlignedValueDigit(
        token,
        value_str,
        value_ind,
        significant
      );
      if (c !== "0") significant = true;
    } else {
      c = "0";
      significant = false;
    }
    formatPlaceholder(token, c, significant, result);
  }
}

function getFraction(x: number, D: number): [number, number] {
  const sgn = x < 0 ? -1 : 1;
  let B = x * sgn;
  let P_2 = 0.0;
  let P_1 = 1.0;
  let P = 0.0;
  let Q_2 = 1.0;
  let Q_1 = 0.0;
  let Q = 0.0;
  let A = Math.floor(B);

  while (Q_1 < D) {
    A = Math.floor(B);
    P = A * P_1 + P_2;
    Q = A * Q_1 + Q_2;
    if (B - A < 0.00000005) break;
    B = 1 / (B - A);
    P_2 = P_1;
    P_1 = P;
    Q_2 = Q_1;
    Q_1 = Q;
  }
  if (Q > D)
    if (Q_1 > D) {
      Q = Q_2;
      P = P_2;
    } else {
      Q = Q_1;
      P = P_1;
    }
  return [Math.trunc(sgn * P), Math.trunc(Q)];
}

function formatFraction(value: number, fmt: Section): string {
  if (!fmt.fraction) return "";

  let integral = 0;
  const sign = value < 0;

  if (fmt.fraction.integerPart.length) {
    integral = Math.trunc(value);
    value = Math.abs(value - integral);
  }

  let numerator: number;
  let denominator: number;

  if (fmt.fraction.denominatorConstant) {
    denominator = fmt.fraction.denominatorConstant;
    const rr = Math.round(value * denominator);
    const b = Math.floor(rr / denominator);
    numerator = Math.trunc(rr - b * denominator);
  } else {
    const denominatorDigits = Math.min(getDigitCount(fmt.fraction.denominator), 7);
    const fraction: [number, number] = getFraction(
      value,
      Math.pow(10, denominatorDigits) - 1
    );
    numerator = fraction[0];
    denominator = fraction[1];
  }

  // Don't hide fraction if at least one zero in the numerator format
  const numerator_zeros = getZeroCount(fmt.fraction.numerator);
  const hideFraction =
    fmt.fraction.integerPart.length > 0 && numerator === 0 && numerator_zeros === 0;

  let result: string[] = [];
  if (sign) result.push("-");

  // Print integer part with significant zero if fraction part is hidden
  if (fmt.fraction.integerPart.length)
    formatThousands(
      Math.abs(integral).toString(),
      false,
      hideFraction,
      fmt.fraction.integerPart,
      result
    );

  const numerator_str = Math.abs(numerator).toString();
  const denominator_str = Math.abs(denominator).toString();

  let fraction: string[] = [];

  formatThousands(numerator_str, false, true, fmt.fraction.numerator, fraction);

  fraction.push("/");

  if (fmt.fraction.denominatorPrefix.length)
    formatThousands("", false, false, fmt.fraction.denominatorPrefix, fraction);

  if (fmt.fraction.denominatorConstant !== 0)
    fraction.push(fmt.fraction.denominatorConstant.toString());
  else formatDenominator(denominator_str, fmt.fraction.denominator, fraction);

  if (fmt.fraction.denominatorSuffix.length)
    formatThousands("", false, false, fmt.fraction.denominatorSuffix, fraction);

  if (hideFraction)
    result.push(" ".repeat(fraction.reduce((acc, val) => acc + val.length, 0)));
  else result.push(fraction.join(""));

  if (fmt.fraction.fractionSuffix.length)
    formatThousands("", false, false, fmt.fraction.fractionSuffix, result);

  return result.join("");
}

function formatThousandsSeparator(value_str: string, digit: number, result: string[]) {
  const position_in_tens = value_str.length - 1 - digit;
  if (position_in_tens > 0 && position_in_tens % 3 === 0) result.push(",");
}

function formatThousands(
  value_str: string,
  thousand_sep: boolean,
  significant_zero: boolean,
  tokens: string[],
  result: string[]
) {
  let significant = false;
  const format_digits = getDigitCount(tokens);
  value_str = value_str.padStart(format_digits, "0");

  // Print literals occurring before any placeholders
  let token_ind = 0;
  while (token_ind < tokens.length) {
    let token = tokens[token_ind];
    if (isPlaceholder(token)) break;
    else formatLiteral(token, result);
    ++token_ind;
  }

  // Print value digits until there are as many digits remaining as there are placeholders
  let digit_ind = 0;
  while (digit_ind < value_str.length - format_digits) {
    significant = true;
    result.push(value_str[digit_ind]);

    if (thousand_sep) formatThousandsSeparator(value_str, digit_ind, result);
    ++digit_ind;
  }

  // Print remaining value digits and format literals
  for (const token of tokens.slice(token_ind)) {
    if (isPlaceholder(token)) {
      const c = value_str[digit_ind];
      if (c !== "0" || (significant_zero && digit_ind === value_str.length - 1))
        significant = true;

      formatPlaceholder(token, c, significant, result);

      if (thousand_sep && (significant || token === "0"))
        formatThousandsSeparator(value_str, digit_ind, result);
      ++digit_ind;
    } else formatLiteral(token, result);
  }
}

function formatDecimals(value_str: string, tokens: string[], result: string[]) {
  const unpadded_digits = value_str.length;
  const format_digits = getDigitCount(tokens);
  value_str = value_str.padEnd(format_digits, "0");

  // Print all format digits
  let value_ind = 0;
  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
    let token = tokens[tokenIndex];
    if (isPlaceholder(token)) {
      let c = value_str[value_ind];
      let significant = value_ind < unpadded_digits;
      formatPlaceholder(token, c, significant, result);
      ++value_ind;
    } else formatLiteral(token, result);
  }
}

function formatNumber(
  value: number,
  before_decimal: string[],
  decimal_separator: boolean,
  after_decimal: string[],
  thousand_sep: boolean,
  result: string[]
) {
  let signitificant_digits = 0;
  if (after_decimal) signitificant_digits = getDigitCount(after_decimal);

  const values = Math.abs(value).toFixed(signitificant_digits).split(".");
  const thousands_str = values[0];
  const decimal_str = values.length > 1 ? values[1].replace(/0+$/gm, "") : "";

  if (value < 0) result.push("-");

  if (before_decimal)
    formatThousands(thousands_str, thousand_sep, false, before_decimal, result);

  if (decimal_separator) result.push(".");

  if (after_decimal) formatDecimals(decimal_str, after_decimal, result);
}

function formatNumberStr(value: number, fmt?: DecimalSection): string {
  if (!fmt) return "";
  value /= fmt.thousandDivisor;
  value *= fmt.percentMultiplier;

  const result: string[] = [];
  formatNumber(
    value,
    fmt.beforeDecimal,
    fmt.decimalSep,
    fmt.afterDecimal,
    fmt.thousandSep,
    result
  );
  return result.join("");
}

function formatExponential(value: number, fmt: Section): string {
  // The application shall display a number to the right of
  // the "E" symbol that corresponds to the number of places that
  // the decimal point was moved.
  if (!fmt.exponential) return "";

  let base_digits = fmt.exponential.beforeDecimal
    ? getDigitCount(fmt.exponential.beforeDecimal)
    : 0;

  let exponent = Math.floor(Math.log10(Math.abs(value)));
  let mantissa = value / Math.pow(10, exponent);

  let shift = Math.abs(exponent) % base_digits;
  if (shift > 0) {
    if (exponent < 0) shift = base_digits - shift;

    mantissa *= Math.pow(10, shift);
    exponent -= shift;
  }

  let result: string[] = [];
  formatNumber(
    mantissa,
    fmt.exponential.beforeDecimal,
    fmt.exponential.decimalSep,
    fmt.exponential.afterDecimal,
    false,
    result
  );

  result.push(fmt.exponential.exponentialToken[0]);

  if (fmt.exponential.exponentialToken[1] === "+" && exponent >= 0) result.push("+");
  else if (exponent < 0) result.push("-");

  formatThousands(
    Math.abs(exponent).toString(),
    false,
    false,
    fmt.exponential.power,
    result
  );
  return result.join("");
}

export function formatNumberToText(
  value: number,
  formatStr: string,
  forEdit?: boolean
) {
  let node: Section | undefined;
  const fmt = new NumberFormat(formatStr);
  if (!fmt.isValid) return value.toString();

  node = getSection(fmt.sections, value);
  if (!node) return value.toString();

  switch (node.sectionType) {
    case SectionType.Number:
      let number = Number(value);
      if (forEdit) {
        if (node.number?.percentMultiplier === 100) {
          return new Decimal(number).times(100).toString() + "%";
        }
        return number.toString();
      }
      if ((node.index === 0 && node.condition) || node.index === 1)
        number = Math.abs(number);

      return formatNumberStr(number, node.number);

    case SectionType.Date:
      return formatDate(excelDateToJSDate(value), node.generalTextDateDurationParts);

    case SectionType.Duration:
      return formatTimespan(
        new TimeSpan(value * MILLISECONDS_IN_A_DAY),
        node.generalTextDateDurationParts
      );

    case SectionType.General | SectionType.Text:
      return formatGeneralText(value.toString(), node.generalTextDateDurationParts);

    case SectionType.Exponential:
      return formatExponential(Number(value), node);

    case SectionType.Fraction:
      return formatFraction(Number(value), node);
  }
}
