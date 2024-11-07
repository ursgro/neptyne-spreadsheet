import { getCell, getRowHeader, kernelAvailable, newTyne, setCell } from "../testing";

describe("merge cells", () => {
  beforeEach(() => {
    newTyne(cy);
  });

  it("merge cells", () => {
    // simple cells merge
    setCell(cy, "A1", "1");
    setCell(cy, "A2", "1");
    getCell(cy, "A1").click().type("{shift}{downArrow}");
    // cy.get("body").type("{meta+m}");
    getCell(cy, "A1").rightclick();
    cy.findByRole("menuitem", { name: "Merge" }).click();
    kernelAvailable(cy);
    cy.wait(4000);
    getCell(cy, "A2").should("not.exist");
    // cy.focused().type("{meta+m}");
    getCell(cy, "A1").rightclick();
    cy.findByRole("menuitem", { name: "Unmerge" }).click();
    kernelAvailable(cy);
    cy.wait(4000);
    getCell(cy, "A2").should("exist");
    getCell(cy, "A2").should("not.have.text", "1");
    // end simple cells merge

    getCell(cy, "A1").click().type("{backspace}");
    getCell(cy, "A2").dblclick().type("foo{enter}");
    getCell(cy, "A1").click().type("{shift}{downArrow}");
    // cy.focused().type("{meta+m}");
    getCell(cy, "A1").rightclick();
    cy.findByRole("menuitem", { name: "Merge" }).click();
    kernelAvailable(cy);
    cy.wait(4000);
    getCell(cy, "A1").should("have.text", "foo");

    // cannot freeze row in the middle of a merged cell
    getRowHeader(cy, "1").rightclick();
    cy.findByRole("menuitem", { name: "Freeze up to row 1" }).click();
    cy.get('[data-testid="merged-cells-validation-form-dialog-title"]').should("exist");
    cy.get('[data-testid="merged-cells-validation-form-dialog-title"]').type("{esc}");

    getCell(cy, "A1").click().rightclick();
    cy.findByRole("menuitem", { name: "Unmerge" }).click();
    kernelAvailable(cy);
    cy.wait(4000);

    getRowHeader(cy, "1").rightclick();
    cy.findByRole("menuitem", { name: "Freeze up to row 1" }).click();
    cy.get('[data-testid="merged-cells-validation-form-dialog-title"]').should(
      "not.exist"
    );

    // cannot merge cells with frozen rows
    getCell(cy, "A1").click().type("{shift}{downArrow}");
    getCell(cy, "A1").rightclick();
    cy.findByRole("menuitem", { name: "Merge" }).click();
    cy.get('[data-testid="merged-cells-validation-form-dialog-title"]').should("exist");
    cy.get('[data-testid="merged-cells-validation-form-dialog-title"]').type("{esc}");

    // merged cells in "unfrozen" zone behave normally

    getCell(cy, "C3").click().type("foo{enter}");
    kernelAvailable(cy);
    getCell(cy, "C3").click().type("{shift}{downArrow}{rightArrow}");
    getCell(cy, "C3").rightclick();
    cy.findByRole("menuitem", { name: "Merge" }).click();
    kernelAvailable(cy);
    getCell(cy, "C3").should("have.text", "foo");
    getCell(cy, "C4").should("not.exist");
    getCell(cy, "D3").should("not.exist");
    getCell(cy, "D4").should("not.exist");
  });
});
