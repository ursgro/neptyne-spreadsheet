import Stack from "@mui/material/Stack";
import { Children, CSSProperties, ReactNode, useEffect, useRef, useState } from "react";

const STYLES: CSSProperties = { position: "absolute" };

export const useWidthCalculation = (
  content: ReactNode,
  onWidthChange: (children: Element[]) => void
): ReactNode => {
  const widthCalculatorRef = useRef<HTMLDivElement>(null);
  const [columnWidthCalculator, setColumnWidthCalculator] = useState<ReactNode>();

  // create react node for children
  useEffect(
    () =>
      setColumnWidthCalculator(
        <Stack
          sx={STYLES}
          visibility="hidden"
          direction="row"
          flexGrow={1}
          ref={widthCalculatorRef}
        >
          {Children.map(content, (node) => (
            <div>{node}</div>
          ))}
        </Stack>
      ),
    [content]
  );

  // as soon as this node mounts, catch its content and erase it from dom
  useEffect(() => {
    if (widthCalculatorRef.current) {
      onWidthChange(Array.from(widthCalculatorRef.current.children));
      setColumnWidthCalculator(undefined);
    }
  }, [columnWidthCalculator, onWidthChange]);

  return columnWidthCalculator;
};
