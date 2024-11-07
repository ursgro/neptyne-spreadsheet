import {
  getCell,
  getCodeEditor,
  getRepl,
  kernelAvailable,
  newTyne,
  runInRepl,
} from "../testing";

describe("autocomplete smoke", () => {
  beforeEach(() => {
    newTyne(cy);
  });

  it("autocomplete smoke", () => {
    // checks that autocomplete is shown when cell content is formula
    getCell(cy, "A1").dblclick().type("=TO");
    getCell(cy, "A1").should("contain.text", "TODAY");
    getCell(cy, "A1").type("{backspace}A");
    getCell(cy, "A1").should("not.contain.text", "TODAY");
    getCell(cy, "A1").should("contain.text", "TAN");
    // dismiss autocomplete and cancel cell edit
    getCell(cy, "A1").type("{esc}{esc}");
    // end
    // checks that user is able to apply suggestions from autocomplete in cell
    getCell(cy, "A1").click().type("=MA{downArrow}{downArrow}{enter}[1, 2]{enter}", {
      delay: 1000,
    });
    kernelAvailable(cy);
    getCell(cy, "A1").should("contain.text", "2");
    // dismiss autocomplete and cancel cell edit
    getCell(cy, "A1").type("{backspace}");
    // end
    runInRepl(cy, "import math");
    // should show autocomplete for sheet cell and top editor
    getCell(cy, "A1").click().type("=math.");
    cy.get(".cm-tooltip-autocomplete").should("exist");
    getCell(cy, "A1").type("pow(2,2){enter}");
    getCell(cy, "A1").should("have.text", "4");
    getCodeEditor(cy).type("=math.pow{downArrow}");
    cy.get(".cm-tooltip-autocomplete").should("exist");
    // end

    // should apply autocomplete for notebook cell
    getRepl(cy).click().type("import math{enter}math.aco");
    cy.get(".cm-tooltip-autocomplete > ul > li").first().click();
    getRepl(cy).should("contain.text", "math.acos");
    getRepl(cy).clear();
    // end

    // checks that autocomplete is not shown within string
    getRepl(cy).click().type('"A');
    cy.get(".cm-tooltip-autocomplete").should("not.exist");
    // end
  });
});
