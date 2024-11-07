import { parseCellId, ParsedSheetCell } from "../../src/SheetUtils";

type CypressGetOptions = Partial<
  Cypress.Loggable & Cypress.Timeoutable & Cypress.Withinable & Cypress.Shadow
>;

export const getCell = (cy: Cypress.cy, a1: string, options?: CypressGetOptions) => {
  const { x: col, y: row } = parseCellId(a1) as ParsedSheetCell;
  return cy.get(`[data-testid="cell-${row}-${col}"]`, options);
};

export const getWidgetCell = (cy: Cypress.cy, a1: string) => {
  const { x: col, y: row } = parseCellId(a1) as ParsedSheetCell;
  const selector = `[data-testid="widget-${row}-${col}"]`;
  return cy.get(selector);
};

export const setCell = (cy: Cypress.cy, a1: string, value: string) => {
  return getCell(cy, a1).click().type(`{enter}${value}{enter}`);
};

export const getButton = (cy: Cypress.cy, iconClass: string) => {
  return cy.get(`[data-testid=${iconClass}]`);
};

export const getAdaptiveToolbarButton = (cy: Cypress.cy, testId: string) =>
  cy.get(`[data-testid="AdaptiveToolbar"] [data-testid="${testId}"]`);

export const kernelAvailable = (cy: Cypress.cy) => {
  cy.get('[data-testid="LogoIcon"]', { timeout: 80000 }).should("be.visible");
};

export const getRepl = (cy: Cypress.cy) => {
  return cy.get(
    '[data-testid="repl-editor"] > .cm-editor > .cm-scroller > .cm-content'
  );
};

export const getCodeEditor = (cy: Cypress.cy) => {
  return cy.get("#code-editor").find(".cm-line");
};

const pasteIntoElement = (el: HTMLElement, code: string) => {
  const pasteEvent = Object.assign(
    new Event("paste", { bubbles: true, cancelable: true }),
    {
      clipboardData: {
        getData: () => code,
      },
    }
  );
  el.dispatchEvent(pasteEvent);
};

export const replaceCode = (cy: Cypress.cy, code: string) => {
  getCodeEditor(cy)
    .last()
    .then((el) => {
      pasteIntoElement(el[0], code);
    });
  getCodeEditor(cy).last().click();
  getRepl(cy).click(); // blur code editor
};

export const runInRepl = (cy: Cypress.cy, code: string) => {
  getRepl(cy)
    .click()
    .then((el) => {
      pasteIntoElement(el[0], code);
    });
  cy.wait(100);
  getRepl(cy).invoke("attr", "contenteditable").should("eq", "true");
  getRepl(cy).type("{enter}");
};

export const getColumnHeader = (cy: Cypress.cy, a1: string) => {
  const { x: col } = parseCellId(a1) as ParsedSheetCell;
  const selector = `[data-testid="header-col-${col}"]`;
  return cy.get(selector);
};

export const getRowHeader = (cy: Cypress.cy, a1: string) => {
  const { y: row } = parseCellId(a1) as ParsedSheetCell;
  const selector = `[data-testid="header-row-${row - 1}"]`;
  return cy.get(selector);
};

export const getTopEditor = (cy: Cypress.cy) => {
  return cy.get('[data-testid="code-container"]').click();
};

export const newTyne = (cy: Cypress.cy) => {
  // TODO: scroll to out-of-viewport cells
  cy.viewport("macbook-16");
  cy.login();
  cy.visit("/sheet/_new");
  kernelAvailable(cy);
};

export enum MuiModalTypes {
  modal = ".MuiModal-root:not(.MuiPopover-root)",
  popover = ".MuiPopover-root",
}

export const closeMuiModal = (cy, type: MuiModalTypes = MuiModalTypes.modal) => {
  cy.get(type + ":not(.MuiModal-hidden)").click();
};
