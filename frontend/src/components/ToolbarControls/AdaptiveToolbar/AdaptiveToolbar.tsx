import { FC, ReactNode, useRef, useState, useMemo, useCallback, Children } from "react";
import useResizeObserver from "@react-hook/resize-observer";
import { useDebounceCallback } from "@react-hook/debounce";
import Stack from "@mui/material/Stack";
import range from "lodash/range";
import { MoreButton } from "./MoreButton";
import { useWidthCalculation } from "./use-width-calculation";

const MORE_BUTTON_WIDTH = 50;

const ADAPTIVE_TOOLBAR_CONTAINER_SX = {
  flexGrow: "1",
  flexShrink: "1",
  overflow: "hidden",
};

const POPOVER_STACK_SX = {
  overflowX: "scroll",
  overflowY: "hidden",
};

const MORE_BUTTON_PROPS = { id: "more-button" };

/**
 * In the end, we need to display visible elements "as is" and put collapsed elements
 * inside a popover.
 *
 * So here we return these two groups of children as two flat lists.
 */
const splitVisibleChildren = (
  elements: ReactNode,
  hiddenSectionIds: number[]
): [visibleChildren: ReactNode[], collapsedChildren: ReactNode[]] => {
  const sections: ReactNode[] = [];
  Children.forEach(elements, (child) => sections.push(child));
  const visibleChildren = sections
    .filter((_, idx) => !hiddenSectionIds.includes(idx))
    .flatMap((section) => section);
  const collapsedChildren = sections
    .filter((_, idx) => hiddenSectionIds.includes(idx))
    .flatMap((section) => section);
  return [visibleChildren, collapsedChildren];
};

interface Props {
  children: ReactNode;
}

/**
 * Receives children and renders them as a horizontal list, collapsing all the overflown elements
 * inside a popover.
 *
 * The items are collapsed not one by one, but in sections. Sections are divided by
 * <Divider /> MUI component.
 */
export const AdaptiveToolbar: FC<Props> = ({ children }) => {
  const resizableElementRef = useRef(null);
  const [initialElementSizes, setInitialElementSizes] = useState<number[]>([]);
  const [hiddenElementIndices, setHiddenElementIndices] = useState<number[]>([]);

  const handleInitialComponentsMount = useCallback(
    (elements: Element[]) =>
      setInitialElementSizes(
        elements.map((element) => element.getBoundingClientRect().width)
      ),
    []
  );

  const calculatorComponent = useWidthCalculation(
    children,
    handleInitialComponentsMount
  );

  useResizeObserver(
    resizableElementRef,
    useDebounceCallback((entry) => {
      // evaluate how many sections fit in resized parent element.
      const viewportWidth = entry.contentRect.width;
      let contentWidth = 0;
      let firstHiddenElement = null;

      for (let elementIdx = 0; elementIdx < initialElementSizes.length; elementIdx++) {
        contentWidth += initialElementSizes[elementIdx];

        // as soon as we find the first section that does not fit - collapse it
        // and all the following ones
        if (
          contentWidth + MORE_BUTTON_WIDTH > viewportWidth &&
          firstHiddenElement === null
        ) {
          firstHiddenElement = elementIdx;
        }
      }

      // We don't need the "more" button if all the elements fit
      if (contentWidth <= viewportWidth) {
        setHiddenElementIndices([]);
        return;
      }

      setHiddenElementIndices(
        firstHiddenElement !== null
          ? range(firstHiddenElement, initialElementSizes.length)
          : []
      );
    }, 20)
  );

  const [visibleChildren, collapsedChildren] = useMemo(
    () => splitVisibleChildren(children, hiddenElementIndices),
    [children, hiddenElementIndices]
  );

  return (
    <>
      <Stack
        alignItems="center"
        direction="row"
        data-testid="AdaptiveToolbar"
        sx={ADAPTIVE_TOOLBAR_CONTAINER_SX}
        ref={resizableElementRef}
      >
        {visibleChildren}
        {!!collapsedChildren.length && (
          <MoreButton
            muiButtonProps={MORE_BUTTON_PROPS}
            popoverContent={
              <Stack
                alignItems="center"
                direction="row"
                flexGrow={1}
                sx={POPOVER_STACK_SX}
              >
                {collapsedChildren}
              </Stack>
            }
          />
        )}
      </Stack>
      {calculatorComponent}
    </>
  );
};
