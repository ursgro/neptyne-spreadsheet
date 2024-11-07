import {
  getAdaptiveToolbarButton,
  getButton,
  getCell,
  newTyne,
  runInRepl,
  setCell,
} from "../testing";

describe("maintains cells after reload", () => {
  beforeEach(() => {
    newTyne(cy);
  });

  it("maintains cells after reload", () => {
    setCell(cy, "A1", "A");
    setCell(cy, "B1", "2");
    getCell(cy, "B1").click();
    getAdaptiveToolbarButton(cy, "ToolbarStyleButton").click();
    getButton(cy, "StyleBoldButton").click();
    getCell(cy, "B1").should("have.class", "cell-format-bold");
    setCell(cy, "C1", "=range(5)");
    runInRepl(cy, "A1");
    cy.reload();
    cy.get('[data-testid="LogoIcon"]', { timeout: 20000 }).should("be.visible");
    getCell(cy, "B1").should("have.class", "cell-format-bold");
    getCell(cy, "B1").should("have.text", "2");
    setCell(cy, "D1", "=A1 * B1");
    getCell(cy, "D1").should("have.text", "AA");
    getCell(cy, "C3").click().type("{backspace}");
    getCell(cy, "C3").should("have.text", "");
    cy.get("div.outputArea").should("have.text", "'A'");
    cy.reload();
    cy.get('[data-testid="LogoIcon"]', { timeout: 20000 }).should("be.visible");
    getCell(cy, "C3").should("have.text", "");
  });
});
