import { Section } from "./section";
import { SectionType } from "./section_type";

export function getFirstSection(sections: Section[], _type: SectionType) {
  for (const section of sections) {
    if (section.sectionType === _type) return section;
  }
}

export function getNumericSection(sections: Section[], value: number) {
  // First section applies if
  // - Has a condition:
  // - There is 1 section, or
  // - There are 2 sections, and the value is 0 or positive, or
  // - There are >2 sections, and the value is positive

  if (!sections.length) return;

  let section0 = sections[0];
  let sections_len = sections.length;

  if (section0.condition) {
    if (section0.condition.evaluate(value)) return section0;
  } else if (
    sections_len === 1 ||
    (sections_len === 2 && value >= 0) ||
    (sections_len >= 2 && value > 0)
  )
    return section0;

  if (sections_len < 2) return;

  const section1 = sections[1];

  // First condition didn't match, or was a negative number. Second condition applies if:
  // - Has a condition, or
  // - Value is negative, or
  // - There are two sections, and the first section had a non-matching condition

  if (section1.condition) {
    if (section1.condition.evaluate(value)) return section1;
  } else if (value < 0 || (sections_len === 2 && section0.condition)) return section1;

  // Second condition didn't match, or was positive. The following
  // sections cannot have conditions, always fall back to the third
  // section (for zero formatting) if specified.
  if (sections_len < 3) return;

  return sections[2];
}

export function getSection(sections: Section[], value: any) {
  // Standard format has up to 4 sections:
  // Positive;Negative;Zero;Text
  switch (typeof value) {
    case "string":
      if (sections.length >= 4) return sections[3];
      return getFirstSection(sections, SectionType.Text);
    case "object":
      if (value instanceof Date) return getFirstSection(sections, SectionType.Date);
      return;
    case "number":
      return getNumericSection(sections, value);
  }
}
