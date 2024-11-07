export const LITERAL_TOKENS = [
  ",",
  "!",
  "&",
  "%",
  "+",
  "-",
  "$",
  "€",
  "£",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "{",
  "}",
  "(",
  ")",
  " ",
];

export const LITERAL_TOKENS_START = ["_", "\\", '"', "*"];
export const DATE_PART_TOKENS_START = ["y", "m", "d", "s", "h"];

export function isExponent(token: string) {
  return ["e+", "e-"].includes(token.toLowerCase());
}

export function isLiteral(token: string) {
  for (const literal of LITERAL_TOKENS_START) {
    if (token.startsWith(literal)) return true;
  }
  return LITERAL_TOKENS.includes(token);
}

export function isPlaceholder(token: string) {
  return ["0", "#", "?"].includes(token);
}

export function isNumberLiteral(token: string) {
  return isPlaceholder(token) || isLiteral(token) || token === ".";
}

export function isGeneral(token: string) {
  return token.toLowerCase() === "general";
}

export function isDurationPart(token: string) {
  const ltoken = token.toLowerCase();
  return ltoken.length >= 2 && ltoken[0] === "[" && ["h", "m", "s"].includes(ltoken[1]);
}

export function isDatePart(token: string) {
  const ltoken = token.toLowerCase();
  for (const literal of DATE_PART_TOKENS_START) {
    if (ltoken.startsWith(literal)) return true;
  }
  return (
    (ltoken.startsWith("g") && !isGeneral(ltoken)) ||
    ltoken === "am/pm" ||
    ltoken === "a/p" ||
    isDurationPart(ltoken)
  );
}

export function isDigit09(token: string) {
  return token >= "0" && token <= "9";
}

export function isDigit19(token: string) {
  return token >= "1" && token <= "9";
}
