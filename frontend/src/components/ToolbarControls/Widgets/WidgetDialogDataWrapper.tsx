import { FunctionComponent, useEffect, useState } from "react";
import { WidgetDialog, WidgetDialogProps } from "./WidgetDialog";
import { SheetLocation } from "../../../SheetUtils";

export type WidgetDialogDataWrapperProps = Omit<WidgetDialogProps, "widgetState"> & {
  getWidgetState: (
    location: SheetLocation,
    currentSheet: number
  ) => Promise<{ [key: string]: any }>;
  currentSheet: number;
};

export const WidgetDialogDataWrapper: FunctionComponent<
  WidgetDialogDataWrapperProps
> = ({ getWidgetState, currentSheet, sheetSelection, onClose, ...props }) => {
  const [widgetState, setWidgetState] = useState<{ [key: string]: any } | null>(null);

  useEffect(() => {
    getWidgetState(sheetSelection.start, currentSheet).then(setWidgetState);
  }, [sheetSelection, getWidgetState, currentSheet]);

  return (
    widgetState && (
      <WidgetDialog
        {...props}
        sheetSelection={sheetSelection}
        widgetState={widgetState}
        onClose={onClose}
      />
    )
  );
};
