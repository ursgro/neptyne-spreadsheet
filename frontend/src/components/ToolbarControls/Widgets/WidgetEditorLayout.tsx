import React, { FunctionComponent } from "react";
import { Box, Theme } from "@mui/material";
import { SystemStyleObject } from "@mui/system";
import isNil from "lodash/isNil";
import startCase from "lodash/startCase";

export interface WidgetEditorLayoutProps {
  label: string;
  category: string;
  error?: string;
  isRequired?: boolean;
  isInline?: boolean;
  isInputInline?: boolean;
  withoutBorder?: boolean;
  children: React.ReactNode;
}

const BASE_LABEL_SX: SystemStyleObject<Theme> = {
  marginTop: "15px",
  flexGrow: "0",
  flexShrink: "0",
};

const LABEL_SX: SystemStyleObject<Theme> = {
  ...BASE_LABEL_SX,
  display: "block",
  width: "100%",
};

const INLINE_LABEL_SX: SystemStyleObject<Theme> = {
  ...BASE_LABEL_SX,
  display: "inline-block",
  width: "calc(50% - 10px)",
};

const SECTION_LABEL_SX: SystemStyleObject<Theme> = {
  color: "secondary.main",
  fontWeight: "600",
  display: "inline-block",
  margin: "0 5px",
};

const NO_BORDER_SX: SystemStyleObject<Theme> = {
  verticalAlign: "middle",
};

const getBaseBorderSX = (theme: Theme): SystemStyleObject<Theme> => ({
  ...NO_BORDER_SX,
  border: "1px solid transparent",
  borderRadius: "3px",
  transitionProperty: "border-color",
  transitionDuration: theme.transitions.duration.standard + "ms",
  transitionTimingFunction: theme.transitions.easing.easeOut,
});

const getBorderSX = (theme: Theme): SystemStyleObject<Theme> => ({
  ...getBaseBorderSX(theme),
  ":hover, :focus-within": {
    borderColor: theme.palette.secondary.main,
  },
});

const getErrorBorderSX = (theme: Theme): SystemStyleObject<Theme> => ({
  ...getBaseBorderSX(theme),
  borderColor: theme.palette.error.main,
});

const getBaseErrorDisplaySX = (theme: Theme): SystemStyleObject<Theme> => ({
  ...theme.typography.input,
  color: "transparent",
  display: "block",
  transitionDuration: theme.transitions.duration.standard + "ms",
  transitionProperty: "color",
  transitionTimingFunction: theme.transitions.easing.easeOut,
});

const getErrorDisplaySX = (theme: Theme): SystemStyleObject<Theme> => ({
  ...getBaseErrorDisplaySX(theme),
  color: theme.palette.error.main,
});

export const WidgetEditorLayout: FunctionComponent<WidgetEditorLayoutProps> = ({
  children,
  error,
  label,
  category,
  withoutBorder = false,
  isInline = false,
  isInputInline = false,
  isRequired = false,
}) => {
  return (
    <Box component="label" sx={isInline ? INLINE_LABEL_SX : LABEL_SX}>
      {label}
      <Box component="span" sx={SECTION_LABEL_SX}>
        {startCase(category)}
        {""}
        {isRequired && "*"}
      </Box>
      <Box
        sx={
          withoutBorder ? NO_BORDER_SX : isNil(error) ? getBorderSX : getErrorBorderSX
        }
        display={isInputInline ? "inline-block" : "block"}
      >
        {children}
      </Box>
      <Box
        component="span"
        sx={isNil(error) ? getBaseErrorDisplaySX : getErrorDisplaySX}
      >
        {error}
      </Box>
    </Box>
  );
};
