import { TyneListItem } from "../../NeptyneProtocol";
import { matchesSearchQuery } from "./OpenTyneDialogDataWrapper";

test.each<[string, string, boolean]>([
  ["foobar", "foo", true],
  ["foobar", "foo  ", true],
  ["foobar", "foo  bar", false],
  ["foobar", "Foo", true],
  ["Foobar", "Foo", true],
  ["Foobar", "foo", true],
])("matchesSearchQuery(%s, %s) === %s", (haystack, needle, isFound) =>
  expect(matchesSearchQuery({ name: haystack } as TyneListItem, needle)).toBe(isFound)
);
