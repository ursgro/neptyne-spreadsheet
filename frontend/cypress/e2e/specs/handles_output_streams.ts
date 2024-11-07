import { getCell, kernelAvailable, newTyne, runInRepl } from "../testing";

describe("handles output streams", () => {
  beforeEach(() => {
    newTyne(cy);
  });

  it("handles output streams", () => {
    runInRepl(cy, "print(1)\nprint(2)");
    kernelAvailable(cy);
    cy.get(".outputArea > span").should(($span) => {
      expect($span.get(0).innerText).to.contain("1\n2");
    });
    runInRepl(cy, "A1 = 'foo'\nprint('bar')");
    kernelAvailable(cy);
    cy.get(".outputArea").should("contain.text", "bar");
    getCell(cy, "A1").should("contain.text", "foo");
  });
});
