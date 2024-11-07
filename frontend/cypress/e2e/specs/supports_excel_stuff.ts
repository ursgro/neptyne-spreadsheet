import { getCell, kernelAvailable, newTyne, runInRepl, setCell } from "../testing";

describe("supports excel stuff", () => {
  beforeEach(() => {
    newTyne(cy);
  });

  it("supports excel stuff", () => {
    runInRepl(
      cy,
      `def double_it(num):
    return num * 2

double_it(num=2)
`
    );
    cy.get("div.outputArea").should("contain.text", "4");
    setCell(cy, "A1", "1");
    setCell(cy, "B1", "=IF(A1=1, double_it(num=A1), 3)");
    getCell(cy, "B1").should("have.text", "2");
    setCell(cy, "C1", "=TODAY()");
    kernelAvailable(cy);
    getCell(cy, "C1")
      .invoke("text")
      .then((text) => {
        const expectedLength = 10;
        expect(text.length).to.be.at.least(
          expectedLength,
          `text ${text} with length ${text.length} should be at least than ${expectedLength}`
        );
      });
    getCell(cy, "D1").type("1{rightArrow}");
    getCell(cy, "D1").should("have.text", "1");
    getCell(cy, "E1").type("=1{rightArrow}");
    getCell(cy, "E1").should("not.have.text", "1");

    setCell(cy, "A2", "1");
    setCell(cy, "B2", "=A2");
    kernelAvailable(cy);
    getCell(cy, "A2")
      .should("have.css", "outline")
      .and("not.match", /dashed/g);
    getCell(cy, "B2").click().type("{enter}");
    getCell(cy, "A2")
      .should("have.css", "outline")
      .and("match", /dashed/g);
    getCell(cy, "B2").type("{esc}");
    getCell(cy, "A2")
      .should("have.css", "outline")
      .and("not.match", /dashed/g);
  });
});
