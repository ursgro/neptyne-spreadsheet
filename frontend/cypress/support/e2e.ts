// ***********************************************************
// This example support/index.js is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Import commands.js using ES2015 syntax:
import "./commands";
import "cypress-real-events/support";

Cypress.on("uncaught:exception", (err, runnable, promise) => {
  if (promise && err.message.includes("comm_info_request")) {
    // jupyter's kernelsession raises if we dispose of the kernel before this promise resolves.
    // it's harmless but we can't catch it.
    return false;
  } else if (err.message.includes("Field is not present in this state")) {
    // This happens because the autocomplete extension in codemirror reconcigures itself
    // with an async function, and (especially in dev) we might create and destroy a codemirror
    // component quickly before the async function has a chance to run. This is harmless.
    return false;
  }
});

Cypress.Keyboard.defaults({
  keystrokeDelay: 100,
});

// Alternatively you can use CommonJS syntax:
// require('./commands')
