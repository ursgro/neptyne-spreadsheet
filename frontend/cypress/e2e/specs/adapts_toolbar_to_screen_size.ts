import { getButton, newTyne } from "../testing";

describe("adapts toolbar to screen size", () => {
  beforeEach(() => {
    newTyne(cy);
  });

  it("adapts toolbar to screen size", () => {
    cy.viewport(2000, 1000);
    getButton(cy, "MoreHorizIcon").should("not.exist");
    cy.viewport(500, 1000);
    getButton(cy, "MoreHorizIcon").should("exist");
  });
});
