import { kernelAvailable, newTyne, replaceCode } from "../testing";

describe("the linter", () => {
  beforeEach(() => {
    newTyne(cy);
  });

  const linter_params = require("../../fixtures/linter_test_params.json");
  linter_params.forEach((test) => {
    it(test.name, () => {
      kernelAvailable(cy);
      replaceCode(cy, test.code);
      cy.get('[data-testid="tyne-rename-input"]').trigger("mouseover").click();
      test.warnings.forEach((warning) => {
        cy.get(
          "#code-editor div.cm-line:nth-child(" + warning.lineno + ") .cm-lintRange",
          { timeout: 20000 }
        ).realHover();
        cy.get(".cm-tooltip", { timeout: 20000 })
          .should("be.visible")
          .and("has.text", warning.line);
        cy.get(
          "#code-editor div.cm-line:nth-child(" + warning.lineno + ") .cm-lintRange",
          { timeout: 20000 }
        ).trigger("mouseleave");
        cy.get('[data-testid="tyne-rename-input"]').trigger("mouseover").click();
      });
    });
  });
});
