import {
  getCell,
  getCodeEditor,
  kernelAvailable,
  newTyne,
  replaceCode,
  runInRepl,
  setCell,
} from "../testing";

describe("shows the flag demo", () => {
  beforeEach(() => {
    newTyne(cy);
  });

  it("shows the flag demo", () => {
    replaceCode(
      cy,
      `
import pandas as pd


def countries_with_s():
    """import countries"""
    df = pd.read_html('https://developers.google.com/public-data/docs/canonical/countries_csv')[0].dropna()
    return df[df['country'].str.startswith('S')]
`
    );
    runInRepl(cy, "A1=countries_with_s()");
    kernelAvailable(cy);

    getCodeEditor(cy)
      .last()
      .click()
      .type(
        "{downArrow}{enter}{enter}" +
          "def flag(code):{enter}" +
          "return ''.join(chr(ord(ch) + 127397) for ch in code){enter}{enter}"
      );

    setCell(cy, "F1", "flag");
    setCell(cy, "F2", "=flag(B2)");
    getCell(cy, "F2").click();
    cy.get("#autofill-drag-control").trigger("mouseover").trigger("mousedown");
    getCell(cy, "F20").trigger("mouseover").trigger("mouseup");

    setCell(cy, "A21", "=Map(C2:C, D2:D, labels=F2:F)");
  });
});
