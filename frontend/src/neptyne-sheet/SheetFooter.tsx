import React, { FunctionComponent, useMemo } from "react";

import { Box } from "@mui/material";
import { FOOTER_HEIGHT } from "./GridView";

interface SheetFooterProps {
  offsetLeft?: number;
  height?: number;
  children: React.ReactNode;
}

export const SheetFooter: FunctionComponent<SheetFooterProps> = ({
  offsetLeft = 0,
  height = FOOTER_HEIGHT,
  children,
}) => {
  const styles = useMemo(
    () => ({
      height,
      marginLeft: offsetLeft + "px",
      overflowY: "hidden",
      whiteSpace: "nowrap",
      flexShrink: 0,
    }),
    [offsetLeft, height]
  );
  return (
    <Box className="hide-scrollbar" sx={styles}>
      {children}
    </Box>
  );
};
