import { getCell, newTyne } from "../testing";

describe("sheet tabs smoke", () => {
  beforeEach(() => {
    newTyne(cy);
  });

  it("sheet tabs smoke", () => {
    cy.get('[data-testid="sheets-menu"]')
      .children('[data-testid="sortable-sheet-Sheet0"]')
      .should("exist");
    cy.get('[data-testid="sheets-menu"]')
      .children('[data-testid="sortable-sheet-Sheet1"]')
      .should("not.exist");
    cy.get('[data-testid="add-sheet"]').click();
    cy.get('[data-testid="sheets-menu"]')
      .children('[data-testid="sortable-sheet-Sheet1"]')
      .should("exist");
    getCell(cy, "C5").click();
    getCell(cy, "C5").should("have.class", "selected");
    cy.get('[data-testid="sheet-Sheet1"]').click();
    getCell(cy, "A1").should("have.class", "selected");
    getCell(cy, "C5").should("not.have.class", "selected");
    getCell(cy, "A1").click().type("1{enter}");
    getCell(cy, "A1").should("contain.text", "1");
    getCell(cy, "C5").should("not.contain.text", "1");
    cy.get('[data-testid="sheet-Sheet0"]').click();
    getCell(cy, "A1").should("not.have.class", "selected");
    getCell(cy, "C5").should("have.class", "selected");
    cy.get('[data-testid="sheet-Sheet0"]').dblclick();
    cy.get('[data-testid="sheet-rename-input"]').should("exist");
    cy.focused().type("foo{enter}");
    cy.get('[data-testid="sheet-rename-input"]').should("not.exist");
    cy.get('[data-testid="sheet-foo"]').should("exist");
  });
});
