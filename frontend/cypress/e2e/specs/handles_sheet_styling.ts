import {
  getAdaptiveToolbarButton,
  getButton,
  getCell,
  kernelAvailable,
  newTyne,
} from "../testing";

describe("sheet styling", () => {
  beforeEach(() => {
    newTyne(cy);
  });
  it("handles borders styling", () => {
    // Should hide gridlines for current sheet
    getCell(cy, "A1").should("have.css", "border-color", "rgba(0, 0, 0, 0.5)");
    getButton(cy, "add-sheet").click();
    getCell(cy, "B1").click();
    getAdaptiveToolbarButton(cy, "BordersButton").click();
    getButton(cy, "border-control-border-all").click();
    getCell(cy, "B2").click();
    getAdaptiveToolbarButton(cy, "BordersButton").click();
    getButton(cy, "border-control-border-bottom").click();
    getButton(cy, "ToggleGridlinesLabel").click();

    // just blur basically
    getCell(cy, "C3").click();

    getCell(cy, "A1").should("have.css", "border-color", "rgba(0, 0, 0, 0)");
    getCell(cy, "B1").should(
      "have.css",
      "border-color",
      "rgb(0, 0, 0) rgba(0, 0, 0, 0) rgba(0, 0, 0, 0) rgb(0, 0, 0)"
    );
    getCell(cy, "B2")
      .should("have.css", "border-top-color", "rgb(0, 0, 0)")
      .should("have.css", "border-bottom-color", "rgba(0, 0, 0, 0)");
    getCell(cy, "B3").should("have.css", "border-top-color", "rgb(0, 0, 0)");
    getButton(cy, "sheet-Sheet1").click();
    getCell(cy, "A1").should("have.css", "border-color", "rgba(0, 0, 0, 0.5)");
    getButton(cy, "sheet-Sheet0").click();
    getAdaptiveToolbarButton(cy, "BordersButton").click();
    getButton(cy, "ToggleGridlinesLabel").click();
    getCell(cy, "A1").should("have.css", "border-color", "rgb(231, 231, 231)");
    getCell(cy, "B1").should(
      "have.css",
      "border-color",
      "rgb(0, 0, 0) rgb(231, 231, 231) rgb(231, 231, 231) rgb(0, 0, 0)"
    );
    getCell(cy, "B2")
      .should("have.css", "border-top-color", "rgb(0, 0, 0)")
      .should("have.css", "border-bottom-color", "rgb(231, 231, 231)");
    getCell(cy, "B3").should("have.css", "border-top-color", "rgb(0, 0, 0)");
    // end

    // background colour
    getCell(cy, "A1").click().type("{alt}h");
    cy.get('[data-testid="shortcut-modal-search"]').type("backg{enter}");
    cy.get('[data-testid="shortcut-modal-search"]').should("not.exist");
    cy.get('[data-testid="color-list"]')
      .children()
      .eq(0)
      .should("have.css", "border")
      .and("match", /solid rgb\(38, 191, 173\)/g);
    cy.focused().type("{rightArrow}");
    cy.get('[data-testid="color-list"]')
      .children()
      .eq(0)
      .should("have.css", "border")
      .and("not.match", /solid rgb\(38, 191, 173\)/g);
    cy.get('[data-testid="color-list"]')
      .children()
      .eq(1)
      .should("have.css", "border")
      .and("match", /solid rgb\(38, 191, 173\)/g);
    cy.focused().type("{enter}");
    kernelAvailable(cy);
    getCell(cy, "A1").should("have.css", "background-color", "rgb(184, 0, 0)");
    // end
  });
});
