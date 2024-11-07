import { getCell, newTyne } from "../testing";

describe("scrolls sheet along with selection", () => {
  beforeEach(() => {
    newTyne(cy);
  });

  it("scrolls sheet along with selection", () => {
    cy.get('[data-testid="horizontal-scrollbar"]').invoke("scrollLeft").should("eq", 0);

    const rightArrows = "{rightArrow}".repeat(9);
    getCell(cy, "A1")
      .click()
      .type("{shift}" + rightArrows, { delay: 30 });

    cy.get('[data-testid="horizontal-scrollbar"]')
      .invoke("scrollLeft")
      .should("not.eq", 0);

    cy.get('[data-testid="vertical-scrollbar"]').invoke("scrollTop").should("eq", 0);
    const downArrows = "{downArrow}".repeat(39);
    cy.get("#autofill-drag-control")
      .parent()
      .type("{shift}" + downArrows, { delay: 30 });

    cy.get('[data-testid="vertical-scrollbar"]')
      .invoke("scrollTop")
      .should("not.eq", 0);
  });
});
