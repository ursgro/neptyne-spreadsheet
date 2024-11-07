import {
  isDatePart,
  isDurationPart,
  isGeneral,
  isNumberLiteral,
  isPlaceholder,
} from "./token";
import { Tokenizer } from "./tokenizer";
import { Condition } from "./condition";
import { FractionSection } from "./fraction_section";
import { ExponentialSection } from "./exponential_section";
import { DecimalSection } from "./decimal_section";
import { SectionType } from "./section_type";
import { Section } from "./section";

export function parseNumberTokens(
  tokens: string[]
): [number, string[], boolean, string[]] {
  let beforeDecimal: string[] = [];
  let afterDecimal: string[] = [];
  let decimalSep: boolean = false;

  let remainder = [];

  for (var index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === "." && !beforeDecimal.length) {
      decimalSep = true;
      beforeDecimal = tokens.slice(0, index);
      remainder = [];
    } else if (isNumberLiteral(token)) {
      remainder.push(token);
    } else if (!token.startsWith("[")) {
      break;
    }
  }

  if (remainder.length) {
    if (beforeDecimal.length) {
      afterDecimal = remainder;
    } else {
      beforeDecimal = remainder;
    }
  }

  return [index, beforeDecimal, decimalSep, afterDecimal];
}

export function tryParseCurrencySymbol(token: string) {
  if (!token || !token.startsWith("$")) return [false, null];
  return [
    true,
    token.includes("-") ? token.slice(1, token.indexOf("-")) : token.slice(1),
  ];
}

export function tryParseColor(token: string): [boolean, string] {
  const tokenizer = new Tokenizer(token);
  if (
    tokenizer.readString("black", true) ||
    tokenizer.readString("blue", true) ||
    tokenizer.readString("cyan", true) ||
    tokenizer.readString("green", true) ||
    tokenizer.readString("magenta", true) ||
    tokenizer.readString("red", true) ||
    tokenizer.readString("white", true) ||
    tokenizer.readString("yellow", true)
  )
    return [true, tokenizer.substring(0, tokenizer.pos)];
  return [false, ""];
}

export function readConditionValue(tokenizer: Tokenizer) {
  tokenizer.readString("-");
  while (tokenizer.readOneOf("0123456789")) {}

  if (tokenizer.readString(".")) while (tokenizer.readOneOf("0123456789")) {}

  if (tokenizer.readString("e+", true) || tokenizer.readString("e-", true)) {
    if (tokenizer.readOneOf("0123456789")) {
      while (tokenizer.readOneOf("0123456789")) {}
    } else return false;
  }
  return true;
}

export function tryParseCondition(token: string): [boolean, Condition | undefined] {
  const tokenizer = new Tokenizer(token);
  if (
    tokenizer.readString("<=") ||
    tokenizer.readString("<>") ||
    tokenizer.readString("<") ||
    tokenizer.readString(">=") ||
    tokenizer.readString(">") ||
    tokenizer.readString("=")
  ) {
    const condition_pos = tokenizer.pos;
    const op = tokenizer.substring(0, condition_pos);
    if (readConditionValue(tokenizer)) {
      const value_str = tokenizer.substring(
        condition_pos,
        tokenizer.pos - condition_pos
      );
      const result = new Condition(op, +value_str);
      return [true, result];
    }
  }
  return [false, undefined];
}

export function readLiteral(reader: Tokenizer): boolean {
  const peek = reader.peek();
  if (peek === "\\" || peek === "*" || peek === "_") {
    reader.advance(2);
    return true;
  } else if (reader.readEnclosed('"', '"')) return true;
  return false;
}

export function readToken(reader: Tokenizer): [string, boolean] {
  const offset = reader.pos;
  if (
    readLiteral(reader) ||
    reader.readEnclosed("[", "]") ||
    // Symbols
    reader.readOneOf("=#?,!&%+-$€£0123456789{}():;/.@ ") ||
    reader.readString("e+", true) ||
    reader.readString("e-", true) ||
    reader.readString("General", true) ||
    // Date
    reader.readString("am/pm", true) ||
    reader.readString("a/p", true) ||
    reader.readOneOrMore("y") ||
    reader.readOneOrMore("Y") ||
    reader.readOneOrMore("m") ||
    reader.readOneOrMore("M") ||
    reader.readOneOrMore("d") ||
    reader.readOneOrMore("D") ||
    reader.readOneOrMore("h") ||
    reader.readOneOrMore("H") ||
    reader.readOneOrMore("s") ||
    reader.readOneOrMore("S") ||
    reader.readOneOrMore("g") ||
    reader.readOneOrMore("G")
  ) {
    return [reader.substring(offset, reader.pos - offset), false];
  }
  return ["", reader.pos < reader.length()];
}

export function parseMilliseconds(tokens: string[]): string[] {
  // if tokens form .0 through .000.., combine to single subsecond token
  const result: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token === ".") {
      let zeros = 0;
      while (i + 1 < tokens.length && tokens[i + 1] === "0") {
        ++i;
        ++zeros;
      }
      if (zeros > 0) result.push("." + new Array(zeros).join("0"));
      else result.push(".");
    } else {
      result.push(token);
    }
    ++i;
  }
  return result;
}

export function parseSection(
  reader: Tokenizer,
  index: number
): [Section | null, boolean] {
  let has_date_parts = false;
  let has_duration_parts = false;
  let has_general_part = false;
  let has_text_part = false;
  let has_placeholders = false;
  let condition: Condition | undefined;
  let color = "";
  const tokens: string[] = [];

  let syntax_error = false;
  while (true) {
    let token: string;
    [token, syntax_error] = readToken(reader);
    if (!token || token === ";") break;
    has_placeholders ||= isPlaceholder(token);
    if (isDatePart(token)) {
      has_date_parts = true;
      has_duration_parts ||= isDurationPart(token);
      tokens.push(token);
    } else if (isGeneral(token)) {
      has_general_part = true;
      tokens.push(token);
    } else if (token === "@") {
      has_text_part = true;
      tokens.push(token);
    } else if (token.startsWith("[")) {
      // Does not add to tokens. Absolute/elapsed time tokens
      // also start with '[', but handled as date part above
      let expression = token.slice(1, -1);
      let parse_condition = tryParseCondition(expression);
      if (parse_condition[0]) {
        condition = parse_condition[1];
      } else {
        let parse_color = tryParseColor(expression);
        if (parse_color[0]) {
          color = parse_color[1];
        } else {
          let parse_currency_symbol = tryParseCurrencySymbol(expression);
          if (parse_currency_symbol[0])
            tokens.push('"' + parse_currency_symbol[1] + '"');
        }
      }
    } else tokens.push(token);
  }
  if (syntax_error || !tokens.length) return [null, syntax_error];

  if (
    (has_date_parts && (has_general_part || has_text_part)) ||
    (has_general_part && (has_date_parts || has_text_part)) ||
    (has_text_part && (has_general_part || has_date_parts))
  )
    // Cannot mix date, general and/or text parts
    return [null, true];

  let fraction: FractionSection | undefined;
  let exponential: ExponentialSection | undefined;
  let number: DecimalSection | undefined;
  let general_text_date_duration: string[] = [];
  let section_type: SectionType | null = null;

  if (has_date_parts) {
    section_type = has_duration_parts ? SectionType.Duration : SectionType.Date;
    general_text_date_duration = parseMilliseconds(tokens);
  } else if (has_general_part) {
    section_type = SectionType.General;
    general_text_date_duration = tokens;
  } else if (has_text_part || !has_placeholders) {
    section_type = SectionType.Text;
    general_text_date_duration = tokens;
  } else {
    fraction = FractionSection.tryParse(tokens);
    if (fraction) section_type = SectionType.Fraction;
    else {
      exponential = ExponentialSection.tryParse(tokens);
      if (exponential) section_type = SectionType.Exponential;
      else {
        number = DecimalSection.tryParse(tokens);
        if (number) section_type = SectionType.Number;
        else return [null, true];
      }
    }
  }
  return [
    {
      index: index,
      sectionType: section_type,
      color: color,
      condition: condition,
      fraction: fraction,
      exponential: exponential,
      number: number,
      generalTextDateDurationParts: general_text_date_duration,
    },
    syntax_error,
  ];
}

export function parseSections(format_str: string): [Section[], boolean] {
  const tokenizer = new Tokenizer(format_str);
  const sections: Section[] = [];
  let syntax_error = false;

  while (true) {
    let [section, section_syntax_error] = parseSection(tokenizer, sections.length);
    if (section_syntax_error) syntax_error = true;
    if (!section) break;
    sections.push(section);
  }
  return [sections, syntax_error];
}
