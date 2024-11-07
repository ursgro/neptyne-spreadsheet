import React, { useCallback, useRef, useState } from "react";

import { Dimension } from "../../NeptyneProtocol";

type CellResizeMouseEvent = MouseEvent | React.MouseEvent;

export const useCellResizeMouseHandler = (
  dimension: Dimension,
  parentRef: React.RefObject<HTMLElement>,
  onResizing: (size: number) => void,
  minSize: number,
  invert: boolean,
  onDragStart?: () => void,
  onDragEnd?: () => void
) => {
  const elementRef = useRef<HTMLDivElement>(null);
  const [position, _setPosition] = useState<number>(0);
  const [size, _setSize] = useState<number>(0);
  const positionRef = useRef<number>(position);
  const sizeRef = useRef<number>(size);
  const setOrigin = (position: number, size: number) => {
    positionRef.current = position;
    sizeRef.current = size;
    _setPosition(position);
    _setSize(size);
  };

  const dimensionMapping = {
    size: dimension === Dimension.Row ? "clientHeight" : "clientWidth",
    pageCoordinate: dimension === Dimension.Row ? "pageY" : "pageX",
  };

  const getOriginalSize = useCallback((): number => {
    return parentRef.current
      ? (parentRef.current[
          dimensionMapping.size as keyof Element as keyof Element
        ] as number)
      : 0;
  }, [parentRef, dimensionMapping.size]);

  const getPageCoordinate = useCallback(
    (event: CellResizeMouseEvent): number => {
      return (
        (event[
          dimensionMapping.pageCoordinate as keyof CellResizeMouseEvent
        ] as number) || 0
      );
    },
    [dimensionMapping.pageCoordinate]
  );

  const handleMouseMoved = useCallback(
    (event: CellResizeMouseEvent) => {
      const delta = getPageCoordinate(event) - positionRef.current;
      const requestedSize = sizeRef.current + (invert ? -1 : 1) * delta;
      if (requestedSize >= minSize) {
        onResizing(requestedSize);
      }
    },
    [invert, getPageCoordinate, onResizing, minSize]
  );

  const handleMouseUp = useCallback(() => {
    onDragEnd && onDragEnd();
    window.removeEventListener("mouseup", handleMouseUp);
    window.removeEventListener("mousemove", handleMouseMoved);
  }, [handleMouseMoved, onDragEnd]);

  const handleMouseDown = useCallback(
    (event: CellResizeMouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setOrigin(getPageCoordinate(event), getOriginalSize());
      onDragStart && onDragStart();

      window.addEventListener("mouseup", handleMouseUp);
      window.addEventListener("mousemove", handleMouseMoved);
    },
    [getPageCoordinate, getOriginalSize, onDragStart, handleMouseUp, handleMouseMoved]
  );

  return {
    elementRef,
    handleMouseDown,
  };
};
