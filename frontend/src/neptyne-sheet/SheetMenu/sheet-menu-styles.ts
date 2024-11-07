import { FOOTER_HEIGHT } from "../GridView";

export const ARROW_DROPDOWN_SX = {
  display: "block",
};

export const SHEETS_MENU_STYLES = {
  height: FOOTER_HEIGHT,
  padding: "0 8px",
  overflow: "auto",
  display: "flex",
  alignItems: "center",
};

export const DIVIDER_STYLES = {
  height: "12px",
  verticalAlign: "middle",
  marginLeft: "8px",
  marginRight: "8px",
};

export const ICON_SX = {
  borderRadius: "5px",
  width: "20px",
  height: "20px",
  margin: "0 8px",
  "&:hover": {
    backgroundColor: "secondary.hover",
  },
};

export const ADD_SHEET_BUTTON_SX = {
  ...ICON_SX,
  margin: "0 8px",
};

export const MENU_BACKGROUND_SX = {
  backgroundColor: "background.default",
  paddingLeft: "8px",
};

export const LARGE_DIVIDER_SX = { height: "30px" };

export const ARROWS_SX = {
  ...ICON_SX,
  "& .MuiIcon-root": {
    fontSize: "10px",
  },
};
