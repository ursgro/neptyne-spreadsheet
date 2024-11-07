import { getCell, newTyne, setCell } from "../testing";

describe("can reference other cells using keyboard", () => {
  beforeEach(() => {
    newTyne(cy);
  });

  it("can reference other cells using keyboard", () => {
    setCell(cy, "A1", "=[[1, 1], [1, 1]]");
    getCell(cy, "A3").click().type("=SUM(", {
      delay: 100,
    });
    getCell(cy, "A1").click().type("{shift}{rightArrow}{downArrow}{enter}");
    getCell(cy, "A3").should("have.text", "4");
    getCell(cy, "A4").should("have.class", "selected");
    getCell(cy, "B3").click().type("=SUM(", {
      delay: 100,
    });
    getCell(cy, "A1").click().type("{shift}{downArrow}");
    getCell(cy, "B3").click("right").type("{rightArrow})+SUM(", {
      delay: 100,
    });
    getCell(cy, "B1").click().type("{shift}{downArrow}{enter}");
    getCell(cy, "B3").should("have.text", "4");
    getCell(cy, "B4").should("have.class", "selected");
    getCell(cy, "C3").click().type("=SUM(", {
      delay: 100,
    });
    getCell(cy, "A1").click();

    // this is a weird hack related to Cypress, but we have to type one symbol to
    // get focus of an element. It works in a real browser
    cy.focused().type("::B2{enter}");
    getCell(cy, "C3").should("have.text", "4");
    getCell(cy, "C4").should("have.class", "selected");
    getCell(cy, "A3").click().type("{backspace}");
    getCell(cy, "A3").type("=SUM({upArrow}{esc}");
    getCell(cy, "A3").get(".value-viewer > .value").should("be.empty");
    getCell(cy, "A3").type("=SUM({upArrow}{shift}{upArrow}{rightArrow}{enter}");
    getCell(cy, "A3").should("have.text", "4");
  });
});
