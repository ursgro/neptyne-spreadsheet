import { Box, Container } from "@mui/material";
import { getGSheetAppConfig } from "./gsheet_app_config";

export const Error = ({ msg }: { msg: string }) => {
  const { inGSMode } = getGSheetAppConfig();
  return (
    <Container>
      <Box marginTop="8" display="flex" flexDirection="column" alignItems="center">
        <Box maxWidth={300}>
          <a href="/">
            <img
              src={(inGSMode ? "https://app.neptyne.com" : "") + "/img/logo.jpg"}
              style={{ maxWidth: "100%" }}
              alt="Neptyne Logo"
            />
          </a>
        </Box>
        <p>
          Something went wrong.{" "}
          {inGSMode
            ? "Try closing this window and re-opening it from the Neptyne Menu"
            : "Try refreshing the page"}
        </p>
        {msg && <p>Error: {msg}</p>}
      </Box>
    </Container>
  );
};
