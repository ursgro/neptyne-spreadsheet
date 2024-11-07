import {
  getAdaptiveToolbarButton,
  getButton,
  getCell,
  getTopEditor,
  newTyne,
  setCell,
  kernelAvailable,
} from "../testing";

describe("should test common cell editor scenarios", () => {
  beforeEach(() => {
    newTyne(cy);
  });

  it("should test common cell editor scenarios", () => {
    // should gracefully reset cell content on ESC when content is added
    setCell(cy, "A1", "=1");
    getCell(cy, "A1").type("+1").type("{esc}");
    getCell(cy, "A1").should("have.text", "1");
    // end
    // should gracefully reset cell content on ESC when content is deleted

    // Disabled because this became flaky
    // getCell(cy, "A1").type("{backspace}");
    // setCell(cy, "A1", "=1+1");
    // getCell(cy, "A1").dblclick().type("{backspace}{backspace}").type("{esc}");
    // getCell(cy, "A1").should("have.text", "2");
    // end
    // should submit value on blur
    getCell(cy, "A1").click().type("{backspace}");
    getCell(cy, "A1").type("Hello!", { delay: 50 });
    cy.get('[data-testid="tyne-rename-input"]').click();
    getCell(cy, "A1").should("have.text", "Hello!");
    // end
    // should overwrite existing value when edit is initiated with typing
    getCell(cy, "A1").type("{backspace}");
    setCell(cy, "A1", "Excel is fine");
    getCell(cy, "A1").type("Neptyne really rocks!");
    getCell(cy, "A1").should("have.text", "Neptyne really rocks!");
    getCell(cy, "A1").clear();
    // end
    // handles Enter submit when value is changed
    getCell(cy, "A1").click().type("cell1{enter}");
    getCell(cy, "A1").should("contain.text", "cell1");
    getCell(cy, "A2").should("have.class", "selected");
    // end
    // handles Enter submit when value is unchanged
    getCell(cy, "A1").type("cell1{enter}");
    getCell(cy, "A1").dblclick().type("{enter}");
    getCell(cy, "A1").should("contain.text", "cell1");
    getCell(cy, "A2").should("have.class", "selected");
    // end
    // handles blur after initiating cell edit with typing text
    getCell(cy, "A1").click().type("bar");
    cy.get('[data-testid="tyne-rename-input"]').click();
    getCell(cy, "A1").should("contain.text", "bar");
    // end
    // should use correct formatting for dates
    getCell(cy, "A1").type("{backspace}{enter}");
    getCell(cy, "A1").type("01/10/1900{enter}");
    getCell(cy, "A1").should("have.text", "01/10/1900");
    getCell(cy, "A1").dblclick().should("contain.text", "01/10/1900");
    getCell(cy, "A1").type("{backspace}{backspace}10{enter}");
    getCell(cy, "A1").should("have.text", "01/10/1910");
    getCell(cy, "A1").dblclick().should("contain.text", "01/10/1910");
    getCell(cy, "B1").type("{backspace}{enter}");
    getCell(cy, "B1").type("10{enter}");
    getCell(cy, "B1").should("have.text", "10");
    getCell(cy, "B1").click();
    getAdaptiveToolbarButton(cy, "NumberFormatButton").click();
    getButton(cy, '"number-format-date-MM/dd/yyyy"').click();
    getCell(cy, "B1").should("have.text", "01/10/1900");
    getCell(cy, "B1").dblclick().should("contain.text", "01/10/1900");
    getCell(cy, "B1").type("{backspace}{backspace}99{enter}");
    getCell(cy, "B1").should("have.text", "01/10/1999");
    getCell(cy, "B1").type("{backspace}{enter}");
    // end
    // should use correct formatting for percent
    getCell(cy, "A1").type("{backspace}{enter}");
    getCell(cy, "A1").type("10%{enter}");
    getCell(cy, "A1").should("have.text", "10%");
    getCell(cy, "A1").dblclick().should("contain.text", "10%");
    getCell(cy, "A1").type("99{enter}");
    getCell(cy, "A1").should("have.text", "10%99");
    getCell(cy, "A1").dblclick().should("contain.text", "10%99");
    getCell(cy, "A1").type("{backspace}".repeat(3)).type("10{enter}");
    getCell(cy, "A1").should("have.text", "1010");
    getCell(cy, "A1").dblclick().should("contain.text", "1010");
    // end
    // should use correct edit value for widget
    getCell(cy, "A1").type("{esc}{backspace}{enter}");
    getCell(cy, "B1").click(); // blur
    setCell(cy, "A1", "=Button('print button', print)");
    getCell(cy, "A1").find(".MuiButton-root").should("have.text", "print button");
    getCell(cy, "A1")
      .dblclick()
      .should("not.contain.text", "=Button('print button', print)");

    getTopEditor(cy).click().should("contain.text", "=Button('print button', print)");
    // end
    // row should not expand on content overflow
    // disabled cause hack used doesn't work for electron, while working just fine on
    // all major browsers.
    // getCell(cy, "A2").dblclick().type("longtextlongtextlongtextlongtext{ctrl+enter}longtextlongtextlongtextlongtext{enter}")
    // getCell(cy, "A2").parent().should("have.css", "height", "20px")
    // end

    getCell(cy, "B2").click();
    kernelAvailable(cy);
    getTopEditor(cy).click().dblclick().type("hello neptyne!{enter}");
    kernelAvailable(cy);
    getCell(cy, "B2").should("have.text", "hello neptyne!");
  });
});
