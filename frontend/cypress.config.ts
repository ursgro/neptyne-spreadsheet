import { defineConfig } from "cypress";

export default defineConfig({
  projectId: "4ktqvo",
  video: false,
  env: {
    TEST_UID: "vBY7MnU9yfhUZiIjakiUjYtarSn2",
  },
  e2e: {
    // We've imported your old cypress plugins here.
    // You may want to clean this up later by importing these.
    setupNodeEvents(on, config) {
      return require("./cypress/plugins/index.ts")(on, config);
    },
    baseUrl: "http://localhost:3000",
    specPattern: "cypress/e2e/**/*.{js,jsx,ts,tsx}",
    scrollBehavior: false,
  },
});
