import { getCell, newTyne, setCell } from "../testing";
import { dependsOnColors } from "../../../src/SheetUtils";
import { hexToRgb } from "@mui/material";

describe("runs a basic spreadsheet function", () => {
  beforeEach(() => {
    newTyne(cy);
  });

  it("runs a basic spreadsheet function", () => {
    setCell(cy, "A1", "2");
    setCell(cy, "B1", "=A1 * 2").should("have.text", "4");
    getCell(cy, "B1").click().type("{enter}");
    getCell(cy, "A1").should(
      "have.css",
      "outline-color",
      hexToRgb(dependsOnColors[0].border)
    );
    getCell(cy, "A1").should(
      "have.css",
      "background-color",
      `${hexToRgb(dependsOnColors[0].bg)}`
    );
  });
});
