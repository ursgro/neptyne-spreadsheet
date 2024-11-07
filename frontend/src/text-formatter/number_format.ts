import { parseSections } from "./parser";
import { getFirstSection } from "./evaluator";
import { SectionType } from "./section_type";
import { Section } from "./section";

export class NumberFormat {
  isValid: boolean = false;
  formatStr: string = "";
  sections: Section[];
  isDateTimeFmt: boolean = false;
  isTimeSpanFmt: boolean = false;
  constructor(format_str: string) {
    const [sections, syntax_error] = parseSections(format_str);
    this.isValid = !syntax_error;
    this.formatStr = format_str;
    if (this.isValid) {
      this.sections = sections;
      this.isDateTimeFmt = !!getFirstSection(this.sections, SectionType.Date);
      this.isTimeSpanFmt = !!getFirstSection(this.sections, SectionType.Duration);
    } else this.sections = [];
  }
}
