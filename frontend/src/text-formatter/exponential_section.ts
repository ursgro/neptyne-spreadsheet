import { isExponent } from "./token";
import { parseNumberTokens } from "./parser";

export class ExponentialSection {
  beforeDecimal: string[];
  decimalSep: boolean;
  afterDecimal: string[];
  exponentialToken: string;
  power: string[];

  constructor(
    before_decimal: string[],
    decimal_sep: boolean,
    after_decimal: string[],
    exponential_token: string,
    power: string[]
  ) {
    this.beforeDecimal = before_decimal;
    this.decimalSep = decimal_sep;
    this.afterDecimal = after_decimal;
    this.exponentialToken = exponential_token;
    this.power = power;
  }

  static tryParse(tokens: string[]): ExponentialSection | undefined {
    const [part_count, before_decimal, decimal_sep, after_decimal] =
      parseNumberTokens(tokens);
    if (!part_count) return;

    if (part_count < tokens.length && isExponent(tokens[part_count])) {
      return new ExponentialSection(
        before_decimal,
        decimal_sep,
        after_decimal,
        tokens[part_count],
        tokens.slice(part_count + 1)
      );
    }
  }
}
