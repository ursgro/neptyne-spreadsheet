import { getCell, kernelAvailable, newTyne, runInRepl, setCell } from "../testing";

describe("Executes some top level menu functions", { testIsolation: false }, () => {
  before(() => {
    newTyne(cy);
  });

  beforeEach(() => {
    cy.viewport("macbook-16");
    kernelAvailable(cy);
  });

  it("Make a copy", () => {
    setCell(cy, "A1", "A1");

    cy.get('[data-testid="action-menu-open-button"]').click();
    cy.get('[data-testid="action-menu-make-copy"]').click();
    cy.get("#rename-text-field").click().type("{selectAll}A New Tyne{enter}");
  });

  it("Rename a tyne", () => {
    cy.get('[data-testid="tyne-rename-input"]', { timeout: 20000 })
      .should("have.value", "A New Tyne")
      .type("{selectAll}Renamed Tyne{enter}", { timeout: 30000 });

    cy.reload();
    kernelAvailable(cy);
    cy.get('[data-testid="tyne-rename-input"]').should("have.value", "Renamed Tyne");
  });

  it("Export and import a tyne", () => {
    cy.get('[data-testid="action-menu-open-button"]').click();
    cy.get('[data-testid="action-menu-export-tyne"]').click();
    cy.get('[data-testid="action-menu-export-tyne-csv"]').click();

    runInRepl(cy, "open('/tmp/tyne.csv', 'w').write('a,b,c\\n1,2,3\\n')");

    cy.get('[data-testid="action-menu-open-button"]').click();
    cy.get('[data-testid="action-menu-import-tyne"]').click();
    cy.get('[data-testid="action-menu-import-tyne-csv"]').click();

    cy.get("input[type=file]")
      .invoke("removeAttr", "style")
      .selectFile("/tmp/tyne.csv")
      .type("{enter}");

    kernelAvailable(cy);

    cy.wait(1000);

    getCell(cy, "B1").type("=tyne!A1{enter}");
    kernelAvailable(cy);
    getCell(cy, "B1").should("contain.text", "a");
  });

  it("Edit secrets", () => {
    runInRepl(cy, "import neptyne as nt");

    getCell(cy, "C1").type("=nt.get_secret('secret'){enter}");
    cy.get('[data-testid="input-modal-text-field"]').click().type("typed{enter}");

    getCell(cy, "C1").should("contain.text", "typed");

    cy.get('[data-testid="action-menu-open-button"]').click();
    cy.get('[data-testid="action-menu-edit-secrets"]').click();

    cy.get('.MuiDataGrid-row > [data-field="value"]').dblclick();
    cy.get('.MuiDataGrid-row > [data-field="value"] > .MuiInputBase-root > input', {
      timeout: 1000,
    })
      .click()
      .type("{selectAll}a{enter}");
    cy.get('[data-testid="save-button"]').wait(300).click();

    kernelAvailable(cy);

    getCell(cy, "D1").click().type("=nt.get_secret('secret'){enter}");
    kernelAvailable(cy);
    getCell(cy, "D1").should("contain.text", "a");
  });
});
