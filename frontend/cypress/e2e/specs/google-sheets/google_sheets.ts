import { TOTP } from "totp-generator";

before(() => {
  Cypress.on("uncaught:exception", (err, runnable) => {
    return false;
  });
  cy.intercept({ resourceType: /xhr|fetch/ }, { log: false });
  cy.visit("https://sheets.google.com/");
  cy.get("#identifierId").click().type("neptyne@neptyne.com");
  cy.get("#identifierNext").click();
  cy.get("#password").click().type(Cypress.env("NEPTYNE_AT_NEPTYNE_PASSWORD"));
  cy.get("#passwordNext").click();

  const { otp } = TOTP.generate(Cypress.env("NEPTYNE_AT_NEPTYNE_TOTP_KEY"));

  if (Cypress.isBrowser("chrome")) {
    cy.get("#totpPin").click().type(otp);
  } else {
    cy.get('input[name="Pin"]').click().type(otp);
  }
  cy.get("#totpNext").click();
});

describe("google sheets", () => {
  it("Can open the extension and use the imperative api / repl", () => {
    cy.origin("https://docs.google.com", () => {
      const { getRepl, runInRepl, getCodeEditor } = Cypress.require("../../testing");
      const generateRandomString = (length) => {
        let result = "";
        const characters =
          "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (let i = 0; i < length; i++) {
          result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return result;
      };

      cy.visit(
        "https://docs.google.com/spreadsheets/d/1_66vSONncHeeA06L5QyXCjfrbw3wuVK3yyPY9I98OB0/edit",
        {
          failOnStatusCode: false,
          timeout: 360000,
        }
      );
      cy.get("#docs-extensions-menu").click();
      cy.wait(3000);
      cy.get(".goog-menuitem-content").contains("Neptyne - Demo").trigger("mouseover");
      cy.get(".goog-menuitem-content").contains("📝 Show Code Editor").click();

      const IFRAME_OUTER = ".script-application-sidebar-content > iframe";
      const IFRAME_MIDDLE = "#sandboxFrame";
      const IFRAME_INNER = "#userHtmlFrame";

      cy.get(IFRAME_OUTER, { timeout: 30000 })
        .its("0.contentDocument.body", { timeout: 30000 })
        .within(() => {
          cy.get(IFRAME_MIDDLE, { timeout: 30000 })
            .its("0.contentDocument.body", { timeout: 30000 })
            .within(() => {
              cy.get(IFRAME_INNER)
                .its("0.contentDocument.body", { timeout: 30000 })
                .within(() => {
                  runInRepl(cy, "A1.clear()");
                  runInRepl(cy, "clear");
                  cy.wait(200);

                  const randomString = generateRandomString(5);

                  getCodeEditor(cy)
                    .first()
                    .click()
                    .wait(100)
                    .type(
                      `{selectall}{backspace}def foo_${randomString}():\n\treturn '${randomString}'`,
                      { delay: 50 }
                    )
                    .wait(100)
                    .blur({ force: true });

                  getRepl(cy).click();

                  cy.get('[data-testid="CheckCircleIcon"]').should("be.visible");

                  runInRepl(cy, `A1 = '=Py("foo_${randomString}")'`);
                  cy.wait(2000);
                  runInRepl(cy, "A1");
                  cy.get("div.outputArea", { timeout: 10000 }).should(
                    "have.text",
                    `'${randomString}'`
                  );
                });
            });
        });
    });
  });
});
