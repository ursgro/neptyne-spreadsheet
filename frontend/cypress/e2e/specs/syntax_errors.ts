import {
  getCodeEditor,
  getRepl,
  kernelAvailable,
  newTyne,
  replaceCode,
} from "../testing";

describe("syntax errors", () => {
  beforeEach(() => {
    newTyne(cy);
  });

  it("should show a syntax error", () => {
    kernelAvailable(cy);
    replaceCode(cy, "(");
    cy.get("[data-testid=ErrorIcon]").should("be.visible");
    getCodeEditor(cy).last().type("{selectall}{backspace}0");
    getRepl(cy).click();
    cy.get("[data-testid=CheckCircleIcon]").should("be.visible");
    getCodeEditor(cy).last().type("{selectall}{backspace})");
    getRepl(cy).click();
    cy.get("[data-testid=ErrorIcon]").should("be.visible");
  });
});
