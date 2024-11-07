import { isPlaceholder } from "./token";
import { parseNumberTokens } from "./parser";

export class DecimalSection {
  thousandSep: boolean;
  thousandDivisor: number;
  percentMultiplier: number;
  beforeDecimal: string[];
  decimalSep: boolean;
  afterDecimal: string[];

  constructor(
    thousand_sep: boolean,
    thousand_divisor: number,
    percent_multiplier: number,
    before_decimal: string[],
    decimal_sep: boolean,
    after_decimal: string[]
  ) {
    this.thousandSep = thousand_sep;
    this.thousandDivisor = thousand_divisor;
    this.percentMultiplier = percent_multiplier;
    this.beforeDecimal = before_decimal;
    this.decimalSep = decimal_sep;
    this.afterDecimal = after_decimal;
  }

  static getPercentMultiplier(tokens: string[]) {
    // If there is a percentage literal in the part list, multiply the result by 100
    for (const token of tokens) {
      if (token === "%") return 100;
    }
    return 1;
  }

  static getTrailingCommasDivisor(tokens: string[]): [number, boolean] {
    // This parses all comma literals in the part list:
    // Each comma after the last digit placeholder divides the result by 1000.
    // If there are any other commas, display the result with thousand separators.

    let has_last_placeholder = false;
    let divisor = 1.0;

    for (let j = 0; j < tokens.length; j++) {
      const token_ind = tokens.length - 1 - j;
      let token = tokens[token_ind];

      if (!has_last_placeholder) {
        if (isPlaceholder(token)) {
          // Each trailing comma multiplies the divisor by 1000
          for (let k = token_ind + 1; k < tokens.length; k++) {
            token = tokens[k];
            if (token === ",") {
              divisor *= 1000.0;
            } else break;
          }
          // Continue scanning backwards from the last digit placeholder,
          // but now look for a thousand separator comma
          has_last_placeholder = true;
        }
      } else if (token === ",") return [divisor, true];
    }
    return [divisor, false];
  }
  static tryParse(tokens: string[]): DecimalSection | undefined {
    let [index, before_decimal, decimal_sep, after_decimal] = parseNumberTokens(tokens);
    if (index === tokens.length) {
      const [divisor, thousand_sep] = DecimalSection.getTrailingCommasDivisor(tokens);
      const multiplier = DecimalSection.getPercentMultiplier(tokens);
      return new DecimalSection(
        thousand_sep,
        divisor,
        multiplier,
        before_decimal,
        decimal_sep,
        after_decimal
      );
    }
  }
}
