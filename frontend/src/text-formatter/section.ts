import { SectionType } from "./section_type";
import { Condition } from "./condition";
import { ExponentialSection } from "./exponential_section";
import { FractionSection } from "./fraction_section";
import { DecimalSection } from "./decimal_section";

export interface Section {
  index: number;
  sectionType: SectionType;
  color: string;
  condition?: Condition;
  exponential?: ExponentialSection;
  fraction?: FractionSection;
  number?: DecimalSection;
  generalTextDateDurationParts: string[];
}
