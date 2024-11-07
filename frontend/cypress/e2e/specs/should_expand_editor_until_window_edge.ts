import { getCell, newTyne } from "../testing";

describe("should expand editor until window edge", () => {
  beforeEach(() => {
    newTyne(cy);
  });

  it("should expand editor until window edge", () => {
    const width = 1000;
    cy.viewport(width, 660);
    const cell = getCell(cy, "A1");
    cell.type("long value".repeat(20), { delay: 1 });
    const nextCell = getCell(cy, "B1");
    cell.get(".cell-code-container").then((cell) => {
      nextCell.then((nextCell) => {
        const cellRightEdge = cell.position().left + cell.width();
        const nextCellLeftEdge = nextCell.position().left;
        expect(cellRightEdge).to.lt(width);
        expect(cellRightEdge).to.gt(nextCellLeftEdge);
      });
    });
  });
});
