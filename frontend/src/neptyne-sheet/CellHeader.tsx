import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";

import { HeaderUnhideButton } from "./HeaderUnhideButton";
import { COLUMN_MIN_WIDTH, ROW_MIN_HEIGHT } from "./GridView";
import { Dimension } from "../NeptyneProtocol";
import { HeaderResizeHandler } from "../components/HeaderResizeHandler/HeaderResizeHandler";
import { SystemStyleObject } from "@mui/system";
import { Theme } from "@mui/material";

const OUTER_BOX_SX: SystemStyleObject = {
  display: "flex",
  justifyContent: "flex-start",
  alignItems: "center",
  height: "100%",
};

// Size of unhide button with all gaps ~20px
const UNHIDE_BUTTON_SIZE = 20;

const TITLE_SX: SystemStyleObject = {
  position: "absolute",
  left: "50%",
  transform: "translateX(-50%)",
  userSelect: "none",
};
export interface CellHeaderProps {
  title: string;
  dimension: Dimension;
  size: number;
  globalIndex: number;
  isContextMenuVisible: boolean;
  hasNextUnHideButton: boolean;
  hasPrevUnHideButton: boolean;
  isActive: boolean;
  onHeaderClick: (index: number, shiftPressed?: boolean, rightClick?: boolean) => void;
  onHandleHeaderResize: (dimension: Dimension, ids: number[], size: number) => void;
  onContextMenu: (event: React.MouseEvent) => void;
  onHeaderUnhideClick: (dimension: Dimension, id: number) => void;
  onHeaderContextMenu: (
    event: React.KeyboardEvent,
    dimension: Dimension,
    headerIndex: number
  ) => void;
}

export const CellHeader: React.FunctionComponent<CellHeaderProps> = React.memo(
  (props) => {
    const {
      title,
      dimension,
      globalIndex,
      isActive,
      isContextMenuVisible,
      hasNextUnHideButton,
      hasPrevUnHideButton,
      onHeaderClick,
      onHandleHeaderResize,
      onContextMenu,
      onHeaderUnhideClick,
      onHeaderContextMenu,
    } = props;

    const parentRef = useRef<HTMLTableHeaderCellElement>(null);

    const [isHovered, setIsHovered] = useState<boolean>(false);

    const hideContextMenuButton = useCallback(() => {
      setIsHovered(false);
    }, []);

    useEffect(() => {
      if (isContextMenuVisible) {
        hideContextMenuButton();
      }
    }, [isContextMenuVisible, hideContextMenuButton]);

    const handleHeaderResize = useCallback(
      (size: number) => {
        onHandleHeaderResize(dimension, [globalIndex], size);
      },
      [dimension, globalIndex, onHandleHeaderResize]
    );

    const handleUnHideClick = useCallback(
      (headerIndex: number) => {
        onHeaderUnhideClick(dimension, headerIndex);
      },
      [onHeaderUnhideClick, dimension]
    );

    const handleClickHeader = useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        onHeaderClick(globalIndex, event.shiftKey, event.buttons === 2);
      },
      [onHeaderClick, globalIndex]
    );

    const handleHeaderContextMenu = useCallback(
      (event: any) => {
        onHeaderContextMenu(event, dimension, globalIndex);
      },
      [dimension, onHeaderContextMenu, globalIndex]
    );
    const thSX = useCallback(
      (theme: Theme): SystemStyleObject => {
        const baseSX: SystemStyleObject = {
          ...theme.typography.body1,
          backgroundColor: "grey.100",
          color: "grey.500",
          cursor: "context-menu",
          height: "100%",
          width: "100%",
        };

        if (isActive) {
          baseSX.backgroundColor = "grey.300";
        }

        return baseSX;
      },
      [isActive]
    );

    const { innerBoxSX, arrowDropdownSX } = useMemo<{
      innerBoxSX: SystemStyleObject;
      arrowDropdownSX: SystemStyleObject;
    }>(
      () => ({
        innerBoxSX: {
          bottom: 0,
          content: '""',
          left: UNHIDE_BUTTON_SIZE,
          position: "absolute",
          right: dimension === Dimension.Col ? UNHIDE_BUTTON_SIZE : 0,
          top: 0,
          WebkitUserSelect: "none" /* Safari */,
          msUserSelect: "none" /* IE 10 and IE 11 */,
          userSelect: "none" /* Standard syntax */,
          height: "100%",
        },
        arrowDropdownSX: {
          maxWidth: COLUMN_MIN_WIDTH - 4,
          maxHeight: COLUMN_MIN_WIDTH - 4,
          outline: "1px solid grey.400",
          zIndex: 1,
          position: "absolute",
          right: dimension === Dimension.Col ? UNHIDE_BUTTON_SIZE : 0,
          backgroundColor: "grey.100",
          "&:hover": {
            backgroundColor: "grey.300",
          },
        },
      }),
      [dimension]
    );

    const handleMouseEnter = useCallback(() => setIsHovered(true), []);

    const handleArrowDropdownClick = useCallback(
      (event: any) => {
        onContextMenu(event);
        onHeaderClick(globalIndex);
      },
      [onContextMenu, globalIndex, onHeaderClick]
    );

    const handlePressedMouseEnter = useCallback(
      (e: React.MouseEvent) => {
        if (e.buttons === 1) {
          onHeaderClick(globalIndex, true);
        }
      },
      [onHeaderClick, globalIndex]
    );

    return (
      <Box
        component="div"
        data-testid={`header-${dimension}-${globalIndex}`}
        ref={parentRef}
        className="rdx-header-cell cell"
        sx={thSX}
        onContextMenu={handleHeaderContextMenu}
        onMouseDown={handleClickHeader}
        onMouseLeave={hideContextMenuButton}
        onMouseEnter={handlePressedMouseEnter}
      >
        <Box component="div" sx={OUTER_BOX_SX}>
          <Box component="div" sx={innerBoxSX} onMouseEnter={handleMouseEnter} />
          {isHovered && (
            <ArrowDropDownIcon
              fontSize="small"
              sx={arrowDropdownSX}
              onClick={handleArrowDropdownClick}
            />
          )}
          <Box sx={TITLE_SX}>{title}</Box>
          <HeaderResizeHandler
            dimension={dimension}
            parentRef={parentRef}
            minSize={dimension === Dimension.Col ? COLUMN_MIN_WIDTH : ROW_MIN_HEIGHT}
            onResizing={handleHeaderResize}
          />
          {(hasNextUnHideButton || hasPrevUnHideButton) && (
            <HeaderUnhideButton
              index={globalIndex}
              dimension={dimension}
              hasNextUnHideButton={hasNextUnHideButton}
              hasPrevUnHideButton={hasPrevUnHideButton}
              onClick={handleUnHideClick}
              onHideContextMenuButton={hideContextMenuButton}
            />
          )}
        </Box>
      </Box>
    );
  }
);
