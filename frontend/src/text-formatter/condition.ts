export class Condition {
  op: string;
  value: number;

  constructor(op: string, value: number) {
    this.op = op;
    this.value = value;
  }
  evaluate(lhs: number) {
    switch (this.op) {
      case "<":
        return lhs < this.value;
      case "<=":
        return lhs <= this.value;
      case ">":
        return lhs > this.value;
      case ">=":
        return lhs >= this.value;
      case "<>":
        return lhs !== this.value;
      case "=":
        return lhs === this.value;
    }
    return false;
  }
}
