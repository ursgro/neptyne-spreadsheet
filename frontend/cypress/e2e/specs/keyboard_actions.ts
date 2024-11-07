import { getCell, newTyne } from "../testing";

describe("sheet styling", () => {
  beforeEach(() => {
    newTyne(cy);
  });
  it("Can select rows/cols", () => {
    getCell(cy, "A1").click().type("{control} ");
    getCell(cy, "A2").should("have.class", "selected");
    getCell(cy, "C3").click();
    getCell(cy, "A1").click().type("{shift} ");
    getCell(cy, "B1").should("have.class", "selected");
  });
});
