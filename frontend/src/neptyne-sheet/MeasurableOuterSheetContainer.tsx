import React, { ComponentPropsWithoutRef, FunctionComponent, useRef } from "react";
import useResizeObserver from "@react-hook/resize-observer";
import { SystemStyleObject } from "@mui/system";
import { Box } from "@mui/material";
import { SCROLL_BAR_SIZE } from "./GridView";
import { useThrottleCallback } from "@react-hook/throttle";

export interface MeasurableOuterSheetContainerProps
  extends ComponentPropsWithoutRef<"div"> {
  onResize: (entry: any) => void;
  hideScrollbars?: boolean;
}

const OUTER_SHEET_CONTAINER_SX: SystemStyleObject = {
  width: "100%",
  height: "100%",
  paddingBottom: SCROLL_BAR_SIZE + "px",
  paddingRight: SCROLL_BAR_SIZE + "px",
  boxSizing: "border-box",
};

const OUTER_SHEET_CONTAINER_NO_SCROLLBARS_SX: SystemStyleObject = {
  ...OUTER_SHEET_CONTAINER_SX,
  paddingBottom: "0",
  paddingRight: "0",
};

export const MeasurableOuterSheetContainer: FunctionComponent<
  MeasurableOuterSheetContainerProps
> = ({ onResize, hideScrollbars, ...props }) => {
  const container = useRef<HTMLDivElement>(null);

  useResizeObserver(container, useThrottleCallback(onResize, 10, true));

  return (
    <Box
      sx={
        hideScrollbars
          ? OUTER_SHEET_CONTAINER_NO_SCROLLBARS_SX
          : OUTER_SHEET_CONTAINER_SX
      }
      id="outer-sheet-container"
      {...props}
      ref={container}
    />
  );
};
