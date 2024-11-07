import { FunctionComponent, memo, useCallback, useState } from "react";
import { ViewUpdate } from "@codemirror/view";
import { EditorStateConfig } from "@codemirror/state";
import { CellIdPicker, CellIdPickerProps } from "../../../cell-id-picking/CellIdPicker";
import { Box, Theme } from "@mui/material";
import { ReactComponent as CellIdPickerIcon } from "../../../icons/cell-id-picker.svg";
import { getWidgetInputSX } from "./WidgetParamEditor";
import { SystemStyleObject } from "@mui/system";

const ICON_SX = {
  color: "grey.800",
  position: "absolute",
  pointerEvents: "none",
  top: "50%",
  right: "10px",
  width: "15px",
  height: "15px",
  transform: "translateY(-50%)",
};

const getWrapperSX = (theme: Theme): SystemStyleObject<Theme> => ({
  ...getWidgetInputSX(theme),
  position: "relative",
  overflow: "hidden",
});

interface WidgetListEditorProps extends CellIdPickerProps {}

export const WidgetListEditor: FunctionComponent<WidgetListEditorProps> = memo(
  ({ onChanges, ...props }) => {
    const [selection, setSelection] = useState<EditorStateConfig["selection"]>();

    const handleUpdate = useCallback(
      (update: ViewUpdate) => {
        if (update.selectionSet) {
          setSelection(update.state.selection);
        }
        if (update.docChanged) {
          onChanges?.(update.state.doc.toString(), true);
        }
      },
      [onChanges]
    );
    return (
      <Box sx={getWrapperSX}>
        <CellIdPicker {...props} selection={selection} onUpdate={handleUpdate} />
        <Box sx={ICON_SX} component={CellIdPickerIcon} />
      </Box>
    );
  }
);
