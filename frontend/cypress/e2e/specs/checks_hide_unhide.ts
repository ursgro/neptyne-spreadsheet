import {
  getCell,
  getColumnHeader,
  getRowHeader,
  kernelAvailable,
  newTyne,
} from "../testing";

describe("checks hide/unhide", () => {
  beforeEach(() => {
    newTyne(cy);
  });

  // TODO: Add tests for Tab-powered submit.
  // Currently it is tricky to do because tab is not yet officially supported by Cypress.
  // Read more: https://github.com/cypress-io/cypress/issues/299
  it("checks hide/unhide", () => {
    // hide B column
    getColumnHeader(cy, "B").rightclick();
    cy.findByRole("menuitem", { name: "Hide column" }).click();
    getColumnHeader(cy, "A").should("exist");
    getColumnHeader(cy, "B").should("not.exist");
    getColumnHeader(cy, "C").should("exist");
    // check that is there unhide buttons showed for the columns A and C
    getColumnHeader(cy, "A")
      .get(`[aria-label="column right unhide button"]`)
      .should("exist");
    getColumnHeader(cy, "A")
      .get(`[aria-label="column left unhide button"]`)
      .should("exist");
    // reload page and check is B still hidden
    cy.reload();
    kernelAvailable(cy);
    getColumnHeader(cy, "B").should("not.exist");
    getColumnHeader(cy, "A")
      .get(`[aria-label="column right unhide button"]`)
      .should("exist");
    getColumnHeader(cy, "A")
      .get(`[aria-label="column left unhide button"]`)
      .should("exist");
    // unhide B column and check is unhide buttons disappeared
    getColumnHeader(cy, "A").get(`[aria-label="column right unhide button"]`).click();
    getColumnHeader(cy, "A")
      .get(`[aria-label="column right unhide button"]`)
      .should("not.exist");
    getColumnHeader(cy, "C")
      .get(`[aria-label="column left unhide button"]`)
      .should("not.exist");
    // check B column
    getColumnHeader(cy, "B").should("be.visible");
    // hide 3 row
    getRowHeader(cy, "3").rightclick();
    cy.findByRole("menuitem", { name: "Hide row" }).click();
    // check that is there unhide buttons showed for the rows 2 and 4
    getRowHeader(cy, "2").get(`[aria-label="row top unhide button"]`).should("exist");
    getRowHeader(cy, "4")
      .get(`[aria-label="row bottom unhide button"]`)
      .should("exist");
    // reload page and check is 3 still hidden
    cy.reload();
    kernelAvailable(cy);
    getRowHeader(cy, "2").get(`[aria-label="row top unhide button"]`).should("exist");
    getRowHeader(cy, "4")
      .get(`[aria-label="row bottom unhide button"]`)
      .should("exist");
    // unhide 3 row and check is unhide buttons disappeared
    getRowHeader(cy, "2").get(`[aria-label="row top unhide button"]`).click();
    getRowHeader(cy, "2")
      .get(`[aria-label="row top unhide button"]`)
      .should("not.exist");
    getRowHeader(cy, "4")
      .get(`[aria-label="row bottom unhide button"]`)
      .should("not.exist");
    // check 3 row
    getRowHeader(cy, "3").should("be.visible");
    //  check correct values in the cells
    getColumnHeader(cy, "B").rightclick();
    cy.findByRole("menuitem", { name: "Hide column" }).click();
    getColumnHeader(cy, "B").should("not.exist");
    getColumnHeader(cy, "A").get(`[aria-label="column right unhide button"]`).click();
    getColumnHeader(cy, "B").should("be.visible");
    getCell(cy, "B1").should("have.text", "");
  });
});
