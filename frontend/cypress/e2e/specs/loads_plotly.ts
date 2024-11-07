import {
  getCell,
  getWidgetCell,
  getTopEditor,
  kernelAvailable,
  newTyne,
  setCell,
  runInRepl,
} from "../testing";

const hasPlotly = (element) => {
  // This just checks for the existence of an iframe. We should probably figure out how to look inside it:
  return element.get("iframe").should("exist");
};

describe("loads plotly", () => {
  beforeEach(() => {
    newTyne(cy);
  });

  it("loads plotly", () => {
    runInRepl(
      cy,
      `import plotly.express as px
plot=px.pie(names=['c', 'd'], values=[20, 20], height=300)
plot`
    );

    // this part gof flaky and I am not sure how to make it better
    // hasPlotly(cy.get("div.outputArea", { timeout: 4000 }));
    setCell(cy, "B2", "=plot");
    // Check both before and after reload because one represents the client-reconciled tyne
    // and the other the server representation
    hasPlotly(getCell(cy, "B2"));
    getWidgetCell(cy, "B2").click();
    getTopEditor(cy).should("contain.text", "=plot");
    runInRepl(cy, "C2=px.pie(names=['e', 'f'], values=[10, 20], height=200)");
    kernelAvailable(cy);
    hasPlotly(getCell(cy, "C2"));
    cy.reload();
    kernelAvailable(cy);
    hasPlotly(getCell(cy, "B2"));
    hasPlotly(getCell(cy, "C2"));
    kernelAvailable(cy);
    getCell(cy, "A1").click().type("{rightarrow}{downarrow}");
    getTopEditor(cy).should("contain.text", "=plot");
  });
});
