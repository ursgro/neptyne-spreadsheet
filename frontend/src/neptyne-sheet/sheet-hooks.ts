import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { CellChangeWithRowCol, CurrentCellContent } from "./NeptyneSheet";
import { ViewUpdate } from "@codemirror/view";
import { isEmpty } from "lodash";
import {
  getCellNumberFormattedValue,
  getCellOriginalValue,
  getDateFormat,
} from "../RenderTools";

import {
  CellAttributes,
  GridElement,
  isCurrencyValue,
  isPercentageValue,
  SheetUnawareCellAttributeUpdate,
} from "../SheetUtils";

import { CellAttribute, NumberFormat } from "../NeptyneProtocol";
import { MovementSource } from "../cell-id-picking/cell-id-picking.store";

/**
 * Handle long press and click.
 *
 * On mouse down start event a timer is created with setTimeout.
 * When the provided time elapses, it triggers long press.
 * On mouse up/mouse leave the timer is cleared.
 */
export const useLongPress = (callback = () => {}, ms = 300) => {
  const [startLongPress, setStartLongPress] = useState<boolean>(false);

  useEffect(() => {
    let timerId: number;
    if (startLongPress) {
      timerId = window.setTimeout(callback, ms);
    }

    return () => {
      clearTimeout(timerId);
    };
  }, [callback, ms, startLongPress]);

  return {
    onMouseDown: () => setStartLongPress(true),
    onMouseUp: () => setStartLongPress(false),
    onMouseLeave: () => setStartLongPress(false),
    onTouchStart: () => setStartLongPress(true),
    onTouchEnd: () => setStartLongPress(false),
  };
};

const getCellNumberAttributeValue = (value: string, attributes: CellAttributes) => {
  const currentAttribute = attributes[CellAttribute.NumberFormat] || "";
  if (currentAttribute.startsWith(NumberFormat.Custom)) {
    return currentAttribute;
  }
  const parsedFormat = getDateFormat(value);
  if (parsedFormat) {
    return `${NumberFormat.Date}-${parsedFormat}`;
  }

  const [isPercent, , precision] = isPercentageValue(value);
  if (isPercent) {
    if (precision > 0) {
      const zeros = "0".repeat(precision);
      return `${NumberFormat.Custom}-0.${zeros}%`;
    }
    return NumberFormat.Percentage;
  }

  const [isCurrency] = isCurrencyValue(value);
  if (isCurrency) {
    return NumberFormat.Money;
  }

  if (attributes[CellAttribute.NumberFormat]) {
    return attributes[CellAttribute.NumberFormat].startsWith(NumberFormat.Date) ||
      attributes[CellAttribute.NumberFormat] === NumberFormat.Percentage
      ? ""
      : currentAttribute;
  }

  return currentAttribute;
};

export const getAttributesWithUpdatedNumberFormat = (
  value: string,
  attributes: CellAttributes
) => {
  const numberFormat = getCellNumberAttributeValue(value, attributes);
  if (numberFormat) {
    return {
      ...attributes,
      [CellAttribute.NumberFormat]: numberFormat,
    };
  }
  if (attributes[CellAttribute.NumberFormat]) {
    const { [CellAttribute.NumberFormat]: _, ...rest } = attributes;
    return rest;
  }
  return attributes;
};

export const useHookWithFormattedValue = (
  cell: GridElement,
  activeRow: number,
  activeColumn: number,
  value: string,
  isEditMode: boolean,
  isSelectingWhileEditing: boolean,
  onUpdateCellValues: (updates: CellChangeWithRowCol[]) => void,
  onCellAttributeChange: (changes: SheetUnawareCellAttributeUpdate[]) => void,
  onSubmitCallback: (value?: string) => void,
  onUpdate?: (value: Partial<CurrentCellContent>) => void
): [
  editorValue: string,
  handleSubmit: (codeMirrorText: string) => void,
  handleUpdate: (viewUpdate: ViewUpdate) => void
] => {
  const isEditing = useRef<boolean>(isEditMode);
  const editorValue = useMemo(() => {
    const attributes = cell?.attributes;
    if (cell?.value && cell?.expression && !isEditing.current && attributes) {
      return getCellNumberFormattedValue(value, attributes);
    }

    return value;
  }, [cell, value, isEditing]);

  const updateCellValue = useCallback(
    (value: string) => {
      const attributes = getAttributesWithUpdatedNumberFormat(
        editorValue,
        cell.attributes || {}
      );
      onUpdateCellValues([
        {
          row: activeRow,
          col: activeColumn,
          value,
          attributes,
        },
      ]);
    },
    [onUpdateCellValues, activeRow, activeColumn, editorValue, cell.attributes]
  );

  const handleSubmit = useCallback(
    (codeMirrorText: string) => {
      if (isSelectingWhileEditing) {
        return;
      }
      onSubmitCallback(codeMirrorText);
      updateCellValue(getCellOriginalValue(codeMirrorText));
      isEditing.current = false;
    },
    [onSubmitCallback, updateCellValue, isSelectingWhileEditing]
  );

  const onDataEditorUpdate = useCallback(
    (newValue: Partial<CurrentCellContent>) => {
      if (onUpdate) {
        if (!isEditing.current) {
          isEditing.current = true;
        }
        onUpdate(newValue);
      }
    },
    [onUpdate]
  );

  const handleUpdate = useCallback(
    (viewUpdate: ViewUpdate) => {
      const updatedObject: Partial<CurrentCellContent> = {};
      if (viewUpdate.docChanged) {
        updatedObject.value = viewUpdate.state.doc.toString();
        // erase movement source, since the last user action is editing
        updatedObject.lastUserMovementSource = undefined;
      }
      if (viewUpdate.selectionSet) {
        const movementSource = getMovementSource(viewUpdate);
        if (movementSource !== undefined) {
          updatedObject.lastUserMovementSource = movementSource;
        }
      }
      if (viewUpdate.selectionSet && !isSelectingWhileEditing) {
        updatedObject.dynamicContentStart = viewUpdate.state.selection.main.head;
        updatedObject.dynamicContentEnd = viewUpdate.state.selection.main.head;
        updatedObject.editorSelection = viewUpdate.state.selection;
      }
      if (!isEmpty(updatedObject) && onDataEditorUpdate) {
        onDataEditorUpdate(updatedObject);
      }
    },
    [isSelectingWhileEditing, onDataEditorUpdate]
  );

  return [editorValue, handleSubmit, handleUpdate];
};

/**
 * Returns information about how user moved inside editor within provided viewUpdate.
 *
 * User movement inside editor results in Codemirror transactions. We can analyze them to get
 * information on how exactly user moves.
 */
const getMovementSource = (viewUpdate: ViewUpdate): MovementSource | undefined => {
  const movementSources = viewUpdate.transactions
    .map((transaction) => {
      if (transaction.isUserEvent("select.pointer")) {
        return "mouse";
      } else if (transaction.isUserEvent("select")) {
        return "keyboard";
      }
      return undefined;
    })
    .filter((source) => !!source);

  return movementSources.length
    ? movementSources[movementSources.length - 1]
    : undefined;
};
