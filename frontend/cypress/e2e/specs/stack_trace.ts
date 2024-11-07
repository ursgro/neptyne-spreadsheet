import { newTyne, kernelAvailable, runInRepl } from "../testing";

describe("stack trace", () => {
  beforeEach(() => {
    newTyne(cy);
  });

  const stack_trace_params = require("../../fixtures/stack_trace_test_params.json");
  stack_trace_params.forEach((test) => {
    it(test.name, () => {
      kernelAvailable(cy);
      runInRepl(cy, test.code);
      kernelAvailable(cy);
      cy.get("div.outputArea", { timeout: 4000 }).should(
        "not.have.text",
        "/neptyne_kernel/"
      );
    });
  });
});
