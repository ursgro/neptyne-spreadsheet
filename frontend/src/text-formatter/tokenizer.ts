export class Tokenizer {
  fmt: string;
  pos: number;

  constructor(fmt: string) {
    this.fmt = fmt;
    this.pos = 0;
  }

  length() {
    return this.fmt.length;
  }

  substring(start_ind: number, length: number) {
    return this.fmt.substring(start_ind, start_ind + length);
  }

  peek(offset: number = 0) {
    if (this.pos + offset >= this.length()) return -1;
    return this.fmt[this.pos + offset];
  }

  peekUntil(start_offset: number, until: string) {
    let offset = start_offset;
    while (true) {
      let c = this.peek(offset++);
      if (c === -1) break;
      if (c === until) return offset - start_offset;
    }
    return 0;
  }

  peekOneOf(offset: number, s: string) {
    const ch = this.peek(offset);
    for (let i = 0; i < s.length; i++) {
      if (ch === s[i]) return true;
    }
    return false;
  }

  advance(characters: number = 1) {
    this.pos = Math.min(this.pos + characters, this.fmt.length);
  }

  readOneOrMore(c: string) {
    if (this.peek() !== c) return false;

    while (this.peek() === c) {
      this.advance();
    }
    return true;
  }

  readOneOf(s: string) {
    if (this.peekOneOf(0, s)) {
      this.advance();
      return true;
    }
    return false;
  }

  readString(s: string, ignore_case: boolean = false) {
    if (this.pos + s.length > this.length()) return false;

    for (let i = 0; i < s.length; i++) {
      const c1 = s[i];
      const c2 = this.peek(i).toString();

      if (ignore_case) {
        if (c1.toLowerCase() !== c2.toLowerCase()) return false;
      } else {
        if (c1 !== c2) return false;
      }
    }
    this.advance(s.length);
    return true;
  }

  readEnclosed(char_open: string, char_close: string) {
    if (this.peek() === char_open) {
      const length = this.peekUntil(1, char_close);
      if (length > 0) {
        this.advance(1 + length);
        return true;
      }
    }
    return false;
  }
}
