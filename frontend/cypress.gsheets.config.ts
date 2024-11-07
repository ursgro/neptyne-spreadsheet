import { defineConfig } from "cypress";

export default defineConfig({
  video: false,
  e2e: {
    specPattern: "cypress/e2e/specs/google-sheets/*.ts",
    scrollBehavior: false,
    experimentalOriginDependencies: true,
  },
  chromeWebSecurity: false,
});
