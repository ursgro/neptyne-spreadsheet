import { getRepl, kernelAvailable, newTyne } from "../testing";

describe("the repl", () => {
  beforeEach(() => {
    newTyne(cy);
  });

  it("can run code", () => {
    kernelAvailable(cy);
    getRepl(cy).wait(100).type("1+1{enter}", { delay: 500 });
    kernelAvailable(cy);
    cy.get(".outputArea").should("contain.text", "2");
  });
});
