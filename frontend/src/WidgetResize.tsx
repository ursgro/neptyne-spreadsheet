import { Backdrop, Box, Theme, useTheme } from "@mui/material";
import React, {
  ComponentProps,
  FunctionComponent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Draggable, { DraggableData, DraggableEventHandler } from "react-draggable";

const CURSOR_TYPE = {
  none: "not-allowed",
  both: "nwse-resize",
  x: "ew-resize",
  y: "ns-resize",
};

const DRAGGABLE_GRID: [number, number] = [10, 10];

const DRAG_HANDLE_STYLE = (theme: Theme) => ({
  position: "absolute",
  width: "7px",
  height: "7px",
  backgroundColor: "secondary.main",
  cursor: "crosshair",
  zIndex: theme.zIndex.widgetResize,
});

const RESIZE_FRAME_STYLE: React.CSSProperties = {
  position: "absolute",
  border: "1px dashed gray",
};

export type Axis = ComponentProps<typeof Draggable>["axis"];

export interface WidgetResizerProps {
  contentWidth: number;
  contentHeight: number;
  onResizeCommit: (x: number, y: number) => void;
}

export const WidgetResizer: FunctionComponent<WidgetResizerProps> = ({
  contentWidth,
  contentHeight,
  onResizeCommit,
}) => {
  const theme = useTheme();
  const [isResizing, setIsResizing] = useState(false);
  const [currentWidth, setCurrentWidth] = useState(contentWidth - 4);
  const [currentHeight, setCurrentHeight] = useState(contentHeight);
  const ratio = useMemo(
    () => contentWidth / contentHeight,
    [contentWidth, contentHeight]
  );

  const [initialSize, setInitialSize] = useState<{ width: number; height: number }>();

  useEffect(() => {
    setInitialSize({ width: contentWidth, height: contentHeight });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onResize = (x: number, y: number, axis: Axis) => {
    // we have to maintain ratio when resizing diagonally
    if (axis === "both") {
      if (y !== currentHeight) {
        setCurrentHeight(y);
        setCurrentWidth(y * ratio);
      } else {
        setCurrentHeight(x / ratio);
        setCurrentWidth(x);
      }
    } else {
      axis === "x" && setCurrentWidth(x);
      axis === "y" && setCurrentHeight(y);
    }
  };

  const handleResizeCommit = useCallback(() => {
    onResizeCommit(currentWidth, currentHeight);
  }, [onResizeCommit, currentWidth, currentHeight]);

  return (
    <>
      {isResizing && (
        <Box
          sx={{
            ...RESIZE_FRAME_STYLE,
            width: currentWidth,
            height: currentHeight,
            zIndex: theme.zIndex.widgetResize,
          }}
        />
      )}
      {/* this box serves as a backdrop, since iframe messes with event bubbling and
      makes onResizeCommit behave weird */}
      {isResizing && initialSize && (
        <Box
          sx={{
            position: "absolute",
            width: initialSize.width,
            height: initialSize.height,
            zIndex: theme.zIndex.modal,
          }}
        />
      )}
      {["x", "y", "both"].map((axis) => (
        <WidgetResizeHandler
          key={axis}
          axis={axis as Axis}
          x={currentWidth}
          y={currentHeight}
          isResizing={isResizing}
          onIsResizingChange={setIsResizing}
          onResize={onResize}
          onResizeCommit={handleResizeCommit}
        />
      ))}

      <Backdrop invisible open={isResizing} />
    </>
  );
};

export interface WidgetResizeHandlerProps {
  x: number;
  y: number;
  axis: Axis;
  isResizing: boolean;
  onIsResizingChange: (isResizing: boolean) => void;
  onResize: (absX: number, absY: number, axis: Axis) => void;
  onResizeCommit: () => void;
}

export const getHandleCoordinate = (
  x: number,
  y: number,
  axis: Axis
): { x: number; y: number } => {
  if (axis === "x") {
    return { x, y: y / 2 };
  }
  if (axis === "y") {
    return { x: x / 2, y };
  }
  return { x, y };
};

export const WidgetResizeHandler: FunctionComponent<WidgetResizeHandlerProps> = ({
  onResize,
  onResizeCommit,
  onIsResizingChange,
  x,
  y,
  axis,
}) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [dragPosition, setDragPosition] = useState(getHandleCoordinate(x, y, axis));

  useEffect(() => setDragPosition(getHandleCoordinate(x, y, axis)), [x, y, axis]);

  const handleDragStart: DraggableEventHandler = useCallback(
    (e) => {
      e.stopPropagation();
      e.preventDefault();
      onIsResizingChange(true);
    },
    [onIsResizingChange]
  );

  const handleDrag: DraggableEventHandler = useCallback(
    (e, { x: deltaX, y: deltaY }: DraggableData) => {
      e.stopPropagation();
      e.preventDefault();
      onResize(deltaX, deltaY, axis);
    },
    [axis, onResize]
  );

  const handleDragStop: DraggableEventHandler = useCallback(
    (e, { x: deltaX, y: deltaY }: DraggableData) => {
      e.stopPropagation();
      e.preventDefault();
      onResize(deltaX, deltaY, axis);
      onResizeCommit();
      onIsResizingChange(false);
    },
    [axis, onResize, onResizeCommit, onIsResizingChange]
  );

  const dragHandleStyle = useMemo(
    () => [DRAG_HANDLE_STYLE, { cursor: axis && CURSOR_TYPE[axis] }],
    [axis]
  );

  return (
    <>
      <Draggable
        position={dragPosition}
        nodeRef={nodeRef}
        onStart={handleDragStart}
        onDrag={handleDrag}
        onStop={handleDragStop}
        axis={axis}
        grid={DRAGGABLE_GRID}
      >
        <Box ref={nodeRef} sx={dragHandleStyle} />
      </Draggable>
    </>
  );
};
