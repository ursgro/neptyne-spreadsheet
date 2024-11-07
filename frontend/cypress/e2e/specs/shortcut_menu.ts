import { getCell, kernelAvailable, newTyne } from "../testing";

describe("shortcut menu", () => {
  beforeEach(() => {
    newTyne(cy);
  });

  it("shortcut menu", () => {
    // check that ALT+H+F+F opens and focuses font select dropdown, and closes it on selecting font.
    getCell(cy, "A1").click().type("{alt}hff");
    cy.get('[data-testid="style-control-font-select"]').should("exist");
    cy.wait(100);
    cy.focused().type("{downArrow}", { delay: 100, force: true });
    cy.focused().type("{enter}", { delay: 100, force: true });
    kernelAvailable(cy);
    cy.get('[data-testid="style-control-font-select"]').should("not.exist");
    getCell(cy, "A1").should("have.css", "font-family", "notoSerif");
    // end

    // check opening shortcut menu
    getCell(cy, "A1").type("{alt}h");
    cy.get('[data-testid="shortcut-modal-search"]').should("exist");
    cy.focused().type("{esc}");
    cy.get('[data-testid="shortcut-modal-search"]').should("not.exist");
    // end

    // check opening shortcut menu and applying shortcut with Enter
    getCell(cy, "A1").type("{alt}h");
    cy.get('[data-testid="shortcut-modal-search"]').type("b{enter}");
    cy.get('[data-testid="shortcut-modal-search"]').should("not.exist");
    kernelAvailable(cy);
    getCell(cy, "A1").should("have.css", "font-weight", "700");
    // end

    // check opening shortcut menu and applying shortcut with click
    getCell(cy, "A1").type("{alt}h");
    cy.get('[data-testid="shortcut-modal-search"]').type("ital");
    cy.findByText("Ital").click();
    cy.get('[data-testid="shortcut-modal-search"]').should("not.exist");
    kernelAvailable(cy);
    getCell(cy, "A1").should("have.css", "font-style", "italic");
    // end

    // check opening shortcut menu
    getCell(cy, "A1").type("{alt}hi");
    cy.get('[data-testid="shortcut-modal-search"]>input').should("have.value", "I");
    cy.focused().type("{esc}");
    // end

    // check flaky shortcuts
    getCell(cy, "B2").click().type("{shift} ");
    getCell(cy, "B2").should("have.class", "selected");
    getCell(cy, "C2").should("have.class", "selected");
    getCell(cy, "C3").should("not.have.class", "selected");

    getCell(cy, "B2").click().type("{shift}{downArrow}");
    cy.focused().type("{shift} ");
    getCell(cy, "B2").should("have.class", "selected");
    getCell(cy, "C2").should("have.class", "selected");
    getCell(cy, "C3").should("have.class", "selected");

    getCell(cy, "D4").click().type("{control} ");
    getCell(cy, "D4").should("have.class", "selected");
    getCell(cy, "D5").should("have.class", "selected");
    getCell(cy, "E5").should("not.have.class", "selected");

    getCell(cy, "D4").click().type("{shift}{downArrow}");
    cy.focused().type("{shift} ");
    getCell(cy, "D4").should("have.class", "selected");
    getCell(cy, "D5").should("have.class", "selected");
    getCell(cy, "E5").should("have.class", "selected");
  });
});
