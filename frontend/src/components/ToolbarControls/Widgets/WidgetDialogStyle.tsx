import { SystemStyleObject } from "@mui/system";
import { alpha, Theme } from "@mui/material";
import { TOOLBAR_HEIGHT } from "../../../ToolbarsStyle";

const CONTAINER_BORDER_RADIUS = "7px";
const WIDGET_DIALOG_SX: SystemStyleObject<Theme> = {
  borderTopLeftRadius: CONTAINER_BORDER_RADIUS,
  borderBottomLeftRadius: CONTAINER_BORDER_RADIUS,
  width: "427px",
  maxWidth: "100vw",
  padding: "15px",
  top: TOOLBAR_HEIGHT + "px",
  bottom: "0",
  height: "initial",
};
export const DRAWER_PAPER_SX = {
  sx: WIDGET_DIALOG_SX,
};
export const getWidgetFormSX = (theme: Theme): SystemStyleObject<Theme> => ({
  backgroundColor: alpha(theme.palette.secondary.main, 0.11),
  borderRadius: CONTAINER_BORDER_RADIUS,
  padding: "18px 32px",
  flexGrow: "1",
  flexShrink: "1",
});
export const getFormHeaderSX = (theme: Theme): SystemStyleObject<Theme> => ({
  ...theme.typography.h3,
  position: "relative",
  "svg:not(.MuiIconButton-root)": {
    color: "secondary.main",
    height: "1.15em",
    verticalAlign: "bottom",
    width: "1.15em",
  },
});
export const CLOSE_BUTTON_SX: SystemStyleObject<Theme> = {
  color: "grey.700",
  width: "25px",
  height: "25px",
  position: "absolute",
  right: 0,
  top: "50%",
  transform: "translateY(-50%)",
  boxSizing: "content-box",
};
export const FORM_SX: SystemStyleObject<Theme> = {
  display: "flex",
  justifyContent: "space-between",
  flexWrap: "wrap",
};
export const ACTION_BUTTON_SX: SystemStyleObject<Theme> = {
  borderRadius: "28px",
};
