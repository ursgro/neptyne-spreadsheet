import { useCallback, useMemo } from "react";

import {
  closestCenter,
  DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  UniqueIdentifier,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { SheetItem } from "./SheetMenu";
import {
  restrictToFirstScrollableAncestor,
  restrictToHorizontalAxis,
} from "@dnd-kit/modifiers";
import sortBy from "lodash/sortBy";

// dnd-kit has a bug that does not allow falsy values as item keys, which is an issue for our
// zero-based IDs. One way to fix it is to increment all ids by 1. In order not to scatter this
// around the codebase, I made these helpers.
export const sheetIdToVirtualKey = (sheet: SheetItem): number => sheet.id + 1;

export const virtualKeyToSheetId = (key: UniqueIdentifier) => (key as number) - 1;

const DND_CONTEXT_MODIFIERS = [
  restrictToHorizontalAxis,
  restrictToFirstScrollableAncestor,
];

export const useSheetsDndOrdering = (
  sheetsOrder: number[],
  sheets: SheetItem[],
  onSheetsReorder: (newSheetsOrder: number[]) => void
) => {
  const [orderedSheets, orderedSheetIds] = useMemo(() => {
    // this way we order sheets with respect to sheetsOrder, and any missing item goes to the end
    const orderedSheets = sortBy(
      sheets,
      ({ id }) => sheetsOrder.indexOf(id) + 1 || Infinity
    );

    return [orderedSheets, orderedSheets.map(({ id }) => id)];
  }, [sheets, sheetsOrder]);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 500,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 500,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      const activeId = virtualKeyToSheetId(active.id);
      const overId = over ? virtualKeyToSheetId(over.id) : null;

      if (activeId !== overId && overId !== null) {
        const updatedSheetsReorder = arrayMove(
          orderedSheetIds,
          orderedSheetIds.indexOf(activeId),
          orderedSheetIds.indexOf(overId)
        );
        onSheetsReorder(updatedSheetsReorder);
      }
    },
    [onSheetsReorder, orderedSheetIds]
  );

  const sortableOrderedSheets = useMemo(
    () => orderedSheets.map((sheet) => ({ ...sheet, id: sheetIdToVirtualKey(sheet) })),
    [orderedSheets]
  );

  return {
    sensors,
    dndContextProps: {
      sensors,
      collisionDetection: closestCenter,
      onDragEnd: handleDragEnd,
      modifiers: DND_CONTEXT_MODIFIERS,
    },
    sortableContextProps: {
      items: sortableOrderedSheets,
      strategy: horizontalListSortingStrategy,
    },
    orderedSheets,
  };
};
