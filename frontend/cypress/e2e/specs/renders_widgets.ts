import { getCell, kernelAvailable, newTyne, replaceCode, setCell } from "../testing";

describe.skip("renders widgets", () => {
  beforeEach(() => {
    newTyne(cy);
  });

  it("renders widgets", () => {
    replaceCode(
      cy,
      `
def update(val='?'):
    A5=val
`
    );
    kernelAvailable(cy);
    setCell(cy, "A1", "=Button('click', update)");
    getCell(cy, "A1").find(".MuiButton-root").should("have.text", "click");
    getCell(cy, "A1").dblclick().type("{selectAll}=Button('click!', update){enter}");
    getCell(cy, "A1").find(".MuiButton-root").should("have.text", "click!");
    getCell(cy, "A1").find(".MuiButton-root").click();
    kernelAvailable(cy);
    getCell(cy, "A5").should("contain.text", "CellEvent");

    setCell(cy, "B1", "=Dropdown(['aap', 'noot', 'mies'], update, 'noot')");
    kernelAvailable(cy);

    cy.get(":nth-child(3) > .MuiOutlinedInput-root > .MuiSelect-select").click();
    cy.get('[data-value="aap"]').click();
    getCell(cy, "A5").should("have.text", "aap");

    getCell(cy, "A5").click().type("{enter}?{enter}");
    getCell(cy, "A5").should("have.text", "aap?");
  });
});
