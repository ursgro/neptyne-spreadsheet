import { SheetSearchStore } from "./sheet-search.store";

test("SheetSearchStore toggle search", () => {
  const sheetSearchStore = new SheetSearchStore();
  expect(sheetSearchStore.isPanelOpen).toBe(false);
  sheetSearchStore.startSearch();
  sheetSearchStore.setSearchQuery("foo", [[{ expression: "foo", value: "foo" }]]);
  expect(sheetSearchStore.isPanelOpen).toBe(true);
  expect(sheetSearchStore.searchQuery).toBe("foo");
  expect(sheetSearchStore.searchMatches.size).toBe(1);
  expect(sheetSearchStore.selectedMatchIdx).toBe(0);
  sheetSearchStore.endSearch();
  expect(sheetSearchStore.isPanelOpen).toBe(false);
  expect(sheetSearchStore.searchQuery).toBe("");
  expect(sheetSearchStore.searchMatches.size).toBe(0);
  expect(sheetSearchStore.selectedMatchIdx).toBe(null);
});

test("SheetSearchStore navigation", () => {
  const sheetSearchStore = new SheetSearchStore();
  expect(sheetSearchStore.isPanelOpen).toBe(false);
  sheetSearchStore.startSearch();
  sheetSearchStore.setSearchQuery("foo", [
    [
      { expression: "foo", value: "foo" },
      { expression: "bar", value: "bar" },
      { expression: "foo", value: "foo" },
    ],
    [
      { expression: "bar", value: "bar" },
      { expression: "foo", value: "foo" },
      { expression: "bar", value: "bar" },
    ],
  ]);
  expect(sheetSearchStore.selectedMatchIdx).toBe(0);
  sheetSearchStore.setNextSelectedMatchIdx();
  expect(sheetSearchStore.selectedMatchIdx).toBe(1);
  sheetSearchStore.setNextSelectedMatchIdx();
  expect(sheetSearchStore.selectedMatchIdx).toBe(2);
  sheetSearchStore.setNextSelectedMatchIdx();
  expect(sheetSearchStore.selectedMatchIdx).toBe(0);
  sheetSearchStore.setPrevSelectedMatchIdx();
  expect(sheetSearchStore.selectedMatchIdx).toBe(2);
  sheetSearchStore.setPrevSelectedMatchIdx();
  expect(sheetSearchStore.selectedMatchIdx).toBe(1);
});
