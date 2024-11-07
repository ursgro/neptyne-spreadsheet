import React, { useCallback } from "react";

import { useCellResizeMouseHandler } from "./use-cell-resize-mouse-handler";
import { Dimension } from "../../NeptyneProtocol";
import { Backdrop } from "@mui/material";

interface Props {
  dimension: Dimension;
  parentRef: React.RefObject<HTMLElement>;
  minSize: number;
  onResizing: (width: number) => void;
  onResizeStart?: () => void;
  onResizeStop?: () => void;
  children?: React.ReactNode;
  className?: string;
  invert?: boolean;
}

export const DragResizeHandler: React.FunctionComponent<Props> = ({
  dimension,
  parentRef,
  minSize,
  onResizing,
  onResizeStart,
  onResizeStop,
  children,
  className,
  invert,
}) => {
  const [dragging, setDragging] = React.useState(false);

  const onDragStart = useCallback(() => {
    onResizeStart?.();
    setDragging(true);
  }, [onResizeStart]);

  const onDragEnd = useCallback(() => {
    onResizeStop?.();
    setDragging(false);
  }, [onResizeStop]);

  const { elementRef, handleMouseDown } = useCellResizeMouseHandler(
    dimension,
    parentRef,
    onResizing,
    minSize,
    invert!!,
    onDragStart,
    onDragEnd
  );

  return (
    <>
      <Backdrop
        open={dragging}
        invisible
        sx={{ zIndex: (theme) => theme.zIndex.tooltip + 1 }}
      />
      <span
        ref={elementRef}
        className={className || `rdx-${dimension}-resize-handle`}
        onMouseDown={handleMouseDown}
        /* needed to prevent header selection after resizing */
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        style={{
          cursor: dimension === Dimension.Row ? "row-resize" : "col-resize",
        }}
      >
        {children && children}
      </span>
    </>
  );
};
