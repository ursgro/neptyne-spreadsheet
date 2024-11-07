import React, { FunctionComponent, ReactNode, useMemo } from "react";
import { Box } from "@mui/material";
import { SystemStyleObject } from "@mui/system";

export interface NeptyneIconButtonGroupProps {
  children: ReactNode;
  reduceOuterMargin?: boolean;
}

const PADDING = ".25em";

export const NeptyneIconButtonGroup: FunctionComponent<NeptyneIconButtonGroupProps> = ({
  reduceOuterMargin = false,
  children,
}) => {
  const groupContainerSX = useMemo<SystemStyleObject>(() => {
    const baseStyle = {
      alignItems: "center",
      display: "flex",
      ".MuiIconButton-root": {},
    };

    if (reduceOuterMargin)
      baseStyle[".MuiIconButton-root"] = {
        paddingLeft: PADDING,
        paddingRight: PADDING,
      };
    else
      baseStyle[".MuiIconButton-root"] = {
        "&:not(:first-of-type)": {
          paddingLeft: PADDING,
        },
        "&:not(:last-of-type)": {
          paddingRight: PADDING,
        },
      };

    return baseStyle;
  }, [reduceOuterMargin]);

  return <Box sx={groupContainerSX}>{children}</Box>;
};
