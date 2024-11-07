import React, {
  CSSProperties,
  FunctionComponent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import Box from "@mui/material/Box";

import { Dimension } from "../../NeptyneProtocol";
import Draggable, {
  DraggableData,
  DraggableEvent,
  DraggableProps,
} from "react-draggable";
import { Z_INDEX_ABOVE_GRID } from "../../neptyne-sheet/GridView";
import { createPortal } from "react-dom";
import { Backdrop, useTheme } from "@mui/material";

interface HeaderResizeHandlerProps {
  dimension: Dimension;
  parentRef: React.RefObject<HTMLTableHeaderCellElement>;
  minSize: number;
  onResizing: (width: number) => void;
  children?: React.ReactNode;
}

const DRAG_UI_MARGIN = 0;

const RESIZE_HANDLE_STYLES: CSSProperties = {
  zIndex: Z_INDEX_ABOVE_GRID,
};

const useDraggableResizeHandler = (
  dimension: Dimension,
  minSize: number,
  onResizing: (width: number) => void,
  parentElement: HTMLTableHeaderCellElement | null
): [
  draggableProps: Partial<DraggableProps>,
  resizeUiRef: React.RefObject<HTMLElement>,
  isDragging: boolean
] => {
  const nodeRef = useRef<HTMLElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const [isDragging, setIsDragging] = useState<boolean>(false);

  const sizeBeforeDrag = parentElement
    ? (parentElement[
        dimension === Dimension.Row ? "clientHeight" : "clientWidth"
      ] as number)
    : 0;

  const handleDragStart = useCallback((e: DraggableEvent) => {
    setIsDragging(true);
    e.stopPropagation();
  }, []);

  const handleDrag = useCallback(
    (e: DraggableEvent, { x, y }: DraggableData) =>
      setPosition({
        x: dimension === Dimension.Col ? x : 0,
        y: dimension === Dimension.Col ? 0 : y,
      }),
    [dimension]
  );

  const handleDragStop = useCallback(
    (e: any, { x, y }: DraggableData) => {
      setIsDragging(false);
      setPosition({ x: 0, y: 0 });
      const updatedSize = sizeBeforeDrag + (dimension === Dimension.Col ? x : y);
      onResizing(updatedSize >= minSize ? updatedSize : minSize);
    },
    [dimension, sizeBeforeDrag, minSize, onResizing]
  );

  const boundSize = -(sizeBeforeDrag - minSize - DRAG_UI_MARGIN);

  const bounds = useMemo(
    () => ({
      left: dimension === Dimension.Col ? boundSize : undefined,
      top: dimension === Dimension.Row ? boundSize : undefined,
    }),
    [dimension, boundSize]
  );

  return [
    {
      nodeRef,
      position,
      bounds,
      axis: dimension === Dimension.Col ? "x" : "y",
      onStart: handleDragStart,
      onStop: handleDragStop,
      onDrag: handleDrag,
    },
    nodeRef,
    isDragging,
  ];
};

export const HeaderResizeHandler: React.FunctionComponent<HeaderResizeHandlerProps> = (
  props
) => {
  const { dimension, parentRef, minSize, onResizing } = props;

  const [draggableProps, elementRef, isDragging] = useDraggableResizeHandler(
    dimension,
    minSize,
    onResizing,
    parentRef.current
  );

  const handleClick = useCallback((e: any) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const isRow = dimension === Dimension.Row;

  const gridRootElement = useMemo(
    () => (isDragging ? document.getElementById("outer-grid-container") : null),
    [isDragging]
  );

  const { initialTopOffset, initialLeftOffset } =
    dimension === Dimension.Col
      ? {
          initialTopOffset: 0,
          initialLeftOffset: parentRef.current?.getBoundingClientRect().right || 0,
        }
      : {
          initialTopOffset:
            (parentRef.current?.getBoundingClientRect().bottom || 0) -
            (gridRootElement?.getBoundingClientRect()?.top || 0),
          initialLeftOffset: parentRef.current?.getBoundingClientRect().right || 0,
        };

  const barSizePixels = 3;
  return (
    <Draggable {...draggableProps}>
      <Box
        ref={elementRef}
        sx={{
          cursor: `${isRow ? "row" : "col"}-resize`,
          position: "absolute",
          width: isRow ? "100%" : `${barSizePixels}px`,
          height: isRow ? `${barSizePixels}px` : "100%",
          top: isRow ? "none" : "1px",
          bottom: isRow ? `-${barSizePixels + 1}px` : "1px",
          right: isRow ? 0 : `-${barSizePixels + 1}px`,
          left: isRow ? "1px" : null,
          paddingY: isRow ? `${barSizePixels}px` : null,
          paddingX: isRow ? null : `${barSizePixels}px`,
          backgroundColor: "#0075ff",
          backgroundClip: "padding-box",
          opacity: 0,
          "&:hover": {
            opacity: 1,
          },
        }}
        style={RESIZE_HANDLE_STYLES}
        onClick={handleClick}
      >
        {isDragging && (
          <ResizeDivider
            dimension={dimension}
            top={initialTopOffset + draggableProps.position!.y}
            left={initialLeftOffset + draggableProps.position!.x}
          />
        )}
      </Box>
    </Draggable>
  );
};

interface ResizeDividerProps {
  dimension: Dimension;
  top: number;
  left: number;
}

const ResizeDivider: FunctionComponent<ResizeDividerProps> = ({
  dimension,
  top,
  left,
}) => {
  const gridRootElement = useMemo(
    () => document.getElementById("outer-grid-container"),
    []
  );
  const theme = useTheme();
  const styles: CSSProperties = useMemo(
    () => ({
      height: dimension === Dimension.Col ? gridRootElement?.clientHeight : "1px",
      width: dimension === Dimension.Col ? "1px" : gridRootElement?.clientWidth,
      [dimension === Dimension.Col ? "marginLeft" : "marginTop"]: "-2.5px",
      backgroundColor: "rgb(89, 145, 246)",
      position: "absolute",
      top,
      left,
      zIndex: theme.zIndex.gridPopover,
    }),
    [dimension, gridRootElement, theme.zIndex.gridPopover, top, left]
  );

  return (
    gridRootElement &&
    createPortal(
      <>
        <Backdrop open invisible sx={{ zIndex: (theme) => theme.zIndex.tooltip + 1 }} />
        <div id="resize-handle" style={styles}></div>
      </>,
      gridRootElement
    )
  );
};
