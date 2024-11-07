import { getCell, getRowHeader, getTopEditor, newTyne, setCell } from "../testing";

describe("cell id picking top editor", () => {
  beforeEach(() => {
    newTyne(cy);
  });

  it("cell id picking top editor", () => {
    setCell(cy, "F1", "=[[1, 1], [1, 1]]");
    getCell(cy, "A3").click();

    getTopEditor(cy).type("=SUM(", {
      delay: 100,
    });
    getCell(cy, "F1").click().type("{shift}{rightArrow}{downArrow}{enter}");
    getCell(cy, "A3").should("have.text", "4");
    getCell(cy, "A4").should("have.class", "selected");

    getCell(cy, "C1").click();
    getTopEditor(cy).type("=SUM(", {
      delay: 100,
    });
    getRowHeader(cy, "1").click().type("{enter}");
    getCell(cy, "C1").should("have.text", "2");
  });
});
