// If you merge this file into Toolbars, jest stops working
import { NEPTYNE_ICON_BUTTON_HEIGHT } from "./components/NeptyneIconButton";

const VERTICAL_PADDING = 11;
const MARGIN_BOTTOM = 5;
export const TOOLBAR_SX = {
  backgroundColor: "background.default",
  borderBottomRightRadius: "15px",
  borderBottomLeftRadius: "15px",
  alignItems: "center",
  display: "flex",
  marginBottom: MARGIN_BOTTOM + "px",
  padding: `${VERTICAL_PADDING}px 10px`,
};

export const TOOLBAR_APPMODE_SX = {
  ...TOOLBAR_SX,
  padding: "5px 7px",
  minHeight: "57px", // ensure enough heigtht for connection status text
};

export const TOOLBAR_HEIGHT =
  NEPTYNE_ICON_BUTTON_HEIGHT + VERTICAL_PADDING * 2 + MARGIN_BOTTOM;
