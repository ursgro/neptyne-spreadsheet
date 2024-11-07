import React, { createRef, useCallback, useEffect, useMemo } from "react";
import Box from "@mui/material/Box";
import debounce from "lodash/debounce";

import {
  COLUMN_HEADER_HEIGHT,
  getHeaderSize,
  NumberDict,
  SCROLL_BAR_SIZE,
} from "./GridView";
import { ScrollBar } from "./ScrollBar";

interface GridScrollBarProps {
  headerSizes: NumberDict;
  scrollOffset: number;
  offsetTop?: number;
  offsetLeft?: number;
  orientation?: "vertical" | "horizontal";
  onScroll: (position: number) => void;
  contentSize: number;
  frozenHeadersSize: number;
}

export const GridScrollBar: React.FunctionComponent<GridScrollBarProps> = (props) => {
  const scrollRef = createRef<HTMLDivElement>();
  const {
    headerSizes,
    scrollOffset,
    offsetTop = 0,
    offsetLeft = 0,
    orientation = "vertical",
    contentSize,
    frozenHeadersSize,
    onScroll,
  } = props;
  const isHorizontal = orientation === "horizontal";
  const roundedOffset = scrollOffset;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const updateScrollOffset = useCallback(
    // prevent scroll from shaking on mouse\trackpad scroll
    debounce(() => {
      if (scrollRef.current) {
        const scrollAttribute = isHorizontal ? "scrollLeft" : "scrollTop";
        scrollRef.current[scrollAttribute] = scrollOffset;
      }
    }, 50),
    [scrollOffset, isHorizontal]
  );

  useEffect(() => {
    updateScrollOffset();
  }, [updateScrollOffset]);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLElement>) => {
      onScroll(isHorizontal ? e.currentTarget.scrollLeft : e.currentTarget.scrollTop);
    },
    [onScroll, isHorizontal]
  );

  const handleNavigation = useCallback(
    (direction: string) => {
      if (scrollRef.current) {
        const headerSize = getHeaderSize(roundedOffset, headerSizes, !isHorizontal);
        const nextOffset =
          direction === "next"
            ? roundedOffset + headerSize
            : roundedOffset - headerSize;
        const scrollTo = isHorizontal ? { left: nextOffset } : { top: nextOffset };
        scrollRef.current.scrollTo(scrollTo);
      }
    },
    [headerSizes, isHorizontal, roundedOffset, scrollRef]
  );

  const scrollBar = useMemo(
    () => {
      return (
        <ScrollBar
          ref={scrollRef}
          contentWidth={isHorizontal ? contentSize : 0}
          contentHeight={isHorizontal ? 0 : contentSize}
          orientation={orientation}
          onScroll={handleScroll}
          onNavigation={handleNavigation}
        />
      );
    }, // eslint-disable-next-line react-hooks/exhaustive-deps
    [scrollOffset, frozenHeadersSize]
  );

  const styles = useMemo(() => {
    return {
      display: "flex",
      flexDirection: isHorizontal ? "row" : "column",
      flexWrap: "nowrap",
      border: "0.5px solid #d9d9d9",
      position: "absolute",
      left: isHorizontal ? offsetLeft : "initial",
      top: isHorizontal ? "initial" : offsetTop,
      bottom: isHorizontal ? 0 : SCROLL_BAR_SIZE,
      right: isHorizontal ? SCROLL_BAR_SIZE : 0,
      height: isHorizontal ? SCROLL_BAR_SIZE : "initial",
      width: isHorizontal ? "initial" : SCROLL_BAR_SIZE,
    };
  }, [offsetLeft, offsetTop, isHorizontal]);

  const shimStyles = useMemo(() => {
    return {
      backgroundColor: "#F5F5F5",
      width: isHorizontal ? frozenHeadersSize : "100%",
      height: isHorizontal ? "100%" : COLUMN_HEADER_HEIGHT + frozenHeadersSize,
      flexShrink: 0,
    };
  }, [frozenHeadersSize, isHorizontal]);

  return (
    <Box sx={styles}>
      <Box sx={shimStyles} />
      {scrollBar}
    </Box>
  );
};
