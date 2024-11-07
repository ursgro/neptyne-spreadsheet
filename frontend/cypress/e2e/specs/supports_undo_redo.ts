import { getAdaptiveToolbarButton, getCell, newTyne, setCell } from "../testing";

describe("supports undo/redo", () => {
  beforeEach(() => {
    newTyne(cy);
  });

  it("supports undo/redo", () => {
    getAdaptiveToolbarButton(cy, "UndoIcon").should("be.disabled");
    getAdaptiveToolbarButton(cy, "RedoIcon").should("be.disabled");
    setCell(cy, "A1", "A");
    getCell(cy, "A1").should("have.text", "A");
    getAdaptiveToolbarButton(cy, "UndoIcon").should("not.be.disabled");
    getAdaptiveToolbarButton(cy, "UndoIcon").click();
    getAdaptiveToolbarButton(cy, "UndoIcon").should("be.disabled");
    getCell(cy, "A1").should("not.have.text", "A");
    getAdaptiveToolbarButton(cy, "RedoIcon").should("not.be.disabled");
    getAdaptiveToolbarButton(cy, "RedoIcon").click();
    getCell(cy, "A1").should("have.text", "A");
  });
});
