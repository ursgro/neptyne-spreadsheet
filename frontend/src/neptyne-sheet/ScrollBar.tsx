import React, { forwardRef, useState, useCallback, useMemo } from "react";
import ArrowLeftIcon from "@mui/icons-material/ArrowLeft";
import ArrowRightIcon from "@mui/icons-material/ArrowRight";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import ArrowDropUpIcon from "@mui/icons-material/ArrowDropUp";
import Box from "@mui/material/Box";

import { SCROLL_BAR_SIZE } from "./GridView";
import { useLongPress } from "./sheet-hooks";
import { Theme } from "@mui/material";
import { SystemStyleObject } from "@mui/system";

interface ScrollBarProps {
  contentWidth: number;
  contentHeight: number;
  orientation?: "vertical" | "horizontal";
  onScroll: (e: React.UIEvent<HTMLElement>) => void;
  onNavigation: (direction: "next" | "prev") => void;
  ref: React.RefObject<HTMLDivElement>;
}

interface ScrollButtonProps {
  onNavigation: (direction: "next" | "prev") => void;
}

const BUTTON_STYLES = {
  height: "100%",
  width: "100%",
  backgroundColor: "#F5F5F5",
};

const VerticalScrollButtons: React.FunctionComponent<ScrollButtonProps> = ({
  onNavigation,
}) => {
  const nextPressProps = useLongPress(() => {
    onNavigation("next");
  });
  const prevPressProps = useLongPress(() => {
    onNavigation("prev");
  });

  return (
    <Box
      sx={{
        width: "inherit",
        display: "flex",
        justifyContent: "end",
        alignItems: "flex-end",
        flexWrap: "wrap",
      }}
    >
      <Box sx={{ backgroundColor: "#d9d9d9", width: "100%", height: "1px" }} />
      <ArrowDropUpIcon
        aria-label="scrollbars up"
        sx={{ ...BUTTON_STYLES, height: SCROLL_BAR_SIZE }}
        onClick={() => {
          onNavigation("prev");
        }}
        {...prevPressProps}
      />
      <Box sx={{ backgroundColor: "#d9d9d9", width: "100%", height: "1px" }} />
      <ArrowDropDownIcon
        aria-label="scrollbars down"
        sx={{ ...BUTTON_STYLES, height: SCROLL_BAR_SIZE }}
        onClick={() => {
          onNavigation("next");
        }}
        {...nextPressProps}
      />
    </Box>
  );
};

const HorizontalScrollButtons: React.FunctionComponent<ScrollButtonProps> = ({
  onNavigation,
}) => {
  const longPressNext = useLongPress(() => {
    onNavigation("next");
  });
  const longPressPrev = useLongPress(() => {
    onNavigation("prev");
  });

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "row",
        height: "100%",
      }}
    >
      <Box sx={{ backgroundColor: "#d9d9d9", width: "1px", height: "100%" }} />
      <ArrowLeftIcon
        aria-label="scrollbars left"
        sx={{ ...BUTTON_STYLES, width: SCROLL_BAR_SIZE }}
        onClick={() => {
          onNavigation("prev");
        }}
        {...longPressPrev}
      />
      <Box sx={{ backgroundColor: "#d9d9d9", width: "1px", height: "100%" }} />
      <ArrowRightIcon
        aria-label="scrollbars right"
        sx={{ ...BUTTON_STYLES, width: SCROLL_BAR_SIZE }}
        onClick={() => {
          onNavigation("next");
        }}
        {...longPressNext}
      />
    </Box>
  );
};

export const ScrollBar = forwardRef<HTMLDivElement, ScrollBarProps>((props, ref) => {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const {
    contentWidth,
    contentHeight,
    orientation = "vertical",
    onScroll,
    onNavigation,
  } = props;
  const isHorizontal = orientation === "horizontal";

  const handleThumbMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleThumbMouseLeave = useCallback(
    (e: any) => {
      e.preventDefault();
      e.stopPropagation();
      if (isDragging) {
        setIsDragging(false);
      }
    },
    [isDragging]
  );

  const handleNavigation = useCallback(
    (direction: "next" | "prev") => {
      onNavigation(direction);
    },
    [onNavigation]
  );

  const getScrollbarBackgroundSX = useCallback(
    (theme: Theme): SystemStyleObject => ({
      backgroundColor: "grey.200",
      zIndex: theme.zIndex.gridWrapper,
      display: "flex",
      flexDirection: isHorizontal ? "row" : "column",
      flexShrink: 1,
      flexGrow: 1,
      [isHorizontal ? "minWidth" : "minHeight"]: 0,
    }),
    [isHorizontal]
  );

  const styles = useMemo(() => {
    return {
      position: "relative",
      left: isHorizontal ? 0 : "-5px",
      transform: isHorizontal ? "scaleY(1.5)" : "scaleX(1.5)",
      top: isHorizontal ? "-5px" : 0,
      cursor: isDragging ? "grabbing" : "pointer",
      overflowY: isHorizontal ? "hidden" : "scroll",
      overflowX: isHorizontal ? "scroll" : "hidden",
      display: isHorizontal ? "inline-grid" : "grid",
      whiteSpace: isHorizontal ? "nowrap" : "normal",
    };
  }, [isDragging, isHorizontal]);

  const thumbStyles = useMemo(() => {
    return {
      width: contentWidth || "inherit",
      height: contentHeight || "inherit",
    };
  }, [contentWidth, contentHeight]);

  return (
    <Box sx={getScrollbarBackgroundSX}>
      <Box
        ref={ref}
        onScroll={onScroll}
        sx={styles}
        data-testid={`${isHorizontal ? "horizontal" : "vertical"}-scrollbar`}
      >
        <Box
          onMouseDown={handleThumbMouseDown}
          onMouseLeave={handleThumbMouseLeave}
          sx={thumbStyles}
        />
      </Box>
      <Box flexShrink={0}>
        {isHorizontal ? (
          <HorizontalScrollButtons onNavigation={handleNavigation} />
        ) : (
          <VerticalScrollButtons onNavigation={handleNavigation} />
        )}
      </Box>
    </Box>
  );
});
