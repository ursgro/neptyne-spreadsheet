import { addDecorator } from "@storybook/react";
import { StyledEngineProvider, ThemeProvider } from "@mui/material/styles";
import { theme } from "../src/theme";
require("../src/App.css");

export const parameters = {
  actions: { argTypesRegex: "^on[A-Z].*" },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
};

// provide our MUI theme to every story
addDecorator((story) => (
  <StyledEngineProvider injectFirst>
    <ThemeProvider theme={theme}>{story()}</ThemeProvider>
  </StyledEngineProvider>
));
