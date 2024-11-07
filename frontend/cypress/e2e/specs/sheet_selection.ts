import { getCell, getColumnHeader, kernelAvailable, newTyne } from "../testing";

describe("sheet selection", () => {
  beforeEach(() => {
    newTyne(cy);
  });

  it("handles different ways to select sheets", () => {
    kernelAvailable(cy);
    getColumnHeader(cy, "B").click();
    getCell(cy, "A1").should("not.have.class", "selected");
    getCell(cy, "B1").should("have.class", "selected");
    getCell(cy, "B2").should("have.class", "selected");
    getCell(cy, "C1").should("not.have.class", "selected");
    getColumnHeader(cy, "C").click();
    getColumnHeader(cy, "D").click({ shiftKey: true });
    getCell(cy, "B1").should("not.have.class", "selected");
    getCell(cy, "C1").should("have.class", "selected");
    getCell(cy, "C2").should("have.class", "selected");
    getCell(cy, "D1").should("have.class", "selected");
    getCell(cy, "D2").should("have.class", "selected");
    getCell(cy, "E1").should("not.have.class", "selected");

    getColumnHeader(cy, "A").trigger("mouseover").trigger("mousedown", { buttons: 1 });
    getColumnHeader(cy, "B").trigger("mouseover", { buttons: 1 }).trigger("mouseup");
    getCell(cy, "A1").should("have.class", "selected");
    getCell(cy, "A2").should("have.class", "selected");
    getCell(cy, "B1").should("have.class", "selected");
    getCell(cy, "B2").should("have.class", "selected");
    getCell(cy, "C1").should("not.have.class", "selected");
  });
});
