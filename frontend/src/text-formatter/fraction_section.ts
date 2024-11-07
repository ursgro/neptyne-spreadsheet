import { isPlaceholder, isDigit09, isDigit19 } from "./token";

export class FractionSection {
  integerPart: string[];
  numerator: string[];
  denominatorPrefix: string[];
  denominator: string[];
  denominatorConstant: number;
  denominatorSuffix: string[];
  fractionSuffix: string[];

  constructor(
    integer_part: string[],
    numerator: string[],
    denominator_prefix: string[],
    denominator: string[],
    denominator_constant: number,
    denominator_suffix: string[],
    fraction_suffix: string[]
  ) {
    this.integerPart = integer_part;
    this.numerator = numerator;
    this.denominatorPrefix = denominator_prefix;
    this.denominator = denominator;
    this.denominatorConstant = denominator_constant;
    this.denominatorSuffix = denominator_suffix;
    this.fractionSuffix = fraction_suffix;
  }

  static tryGetDenominator(
    tokens: string[]
  ): [boolean, string[], string[], number, string[], string[]] {
    let ind = 0;
    let has_placeholder = false;
    let has_constant = false;

    let constant: string[] = [];

    // Read literals until the first number placeholder or digit
    while (ind < tokens.length) {
      let token = tokens[ind];
      if (isPlaceholder(token)) {
        has_placeholder = true;
        break;
      } else if (isDigit19(token)) {
        has_constant = true;
        break;
      }
      ++ind;
    }

    if (!has_placeholder && !has_constant) return [false, [], [], 0, [], []];

    // The denominator starts here, keep the index
    let denominator_ind = ind;

    // Read placeholders or digits in sequence
    while (ind < tokens.length) {
      const token = tokens[ind];
      if (!(has_placeholder && isPlaceholder(token))) {
        if (has_constant && isDigit09(token)) constant.push(token);
        else break;
      }
      ++ind;
    }

    // 'index' is now at the first token after the denominator placeholders.
    // The remaining, if anything, is to be treated in one or two parts:
    // Any ultimately terminating literals are considered the "Fraction suffix".
    // Anything between the denominator and the fraction suffix is the "Denominator suffix".
    // Placeholders in the denominator suffix are treated as insignificant zeros.

    // Scan backwards to determine the fraction suffix
    let fraction_suffix_ind = tokens.length;
    while (fraction_suffix_ind > ind) {
      const token = tokens[fraction_suffix_ind - 1];
      if (isPlaceholder(token)) break;
      fraction_suffix_ind -= 1;
    }

    // Finally, extract the detected token ranges
    let denominator_prefix =
      denominator_ind > 0 ? tokens.slice(0, denominator_ind) : [];
    const denominator_constant = has_constant ? +constant.join("") : 0;
    const denominator_part = tokens.slice(denominator_ind, ind);
    const denominator_suffix =
      ind < fraction_suffix_ind ? tokens.slice(ind, fraction_suffix_ind) : [];
    const fraction_suffix =
      fraction_suffix_ind < tokens.length ? tokens.slice(fraction_suffix_ind) : [];

    return [
      true,
      denominator_prefix,
      denominator_part,
      denominator_constant,
      denominator_suffix,
      fraction_suffix,
    ];
  }

  static getNumerator(tokens: string[]): [string[], string[]] {
    let has_placeholder = false;
    let has_space = false;
    let has_integer_part = false;
    let numerator_ind = -1;
    let ind = tokens.length - 1;

    while (ind >= 0) {
      let token = tokens[ind];
      if (isPlaceholder(token)) {
        has_placeholder = true;
        if (has_space) {
          has_integer_part = true;
          break;
        }
      } else if (has_placeholder && !has_space) {
        // First time we get here marks the end of the integer part
        has_space = true;
        numerator_ind = ind + 1;
      }
      --ind;
    }
    return has_integer_part
      ? [tokens.slice(0, numerator_ind), tokens.slice(numerator_ind)]
      : [[], tokens];
  }

  static tryParse(tokens: string[]): FractionSection | undefined {
    let numerator_parts: string[] = [];
    let denominator_parts: string[] = [];

    for (let i = 0; i < tokens.length; i++) {
      let part = tokens[i];
      if (part === "/") {
        numerator_parts = tokens.slice(0, i);
        denominator_parts = tokens.slice(i + 1);
        break;
      }
    }

    if (!numerator_parts.length) return;

    let [integer_part, numerator_part] = FractionSection.getNumerator(numerator_parts);

    let [
      success,
      denominator_prefix,
      denominator_part,
      denominator_constant,
      denominator_suffix,
      fraction_suffix,
    ] = FractionSection.tryGetDenominator(denominator_parts);
    if (!success) return;

    return new FractionSection(
      integer_part,
      numerator_part,
      denominator_prefix,
      denominator_part,
      denominator_constant,
      denominator_suffix,
      fraction_suffix
    );
  }
}
