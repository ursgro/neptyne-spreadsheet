import React, { forwardRef, useCallback, useRef } from "react";
import {
  getAttributesWithUpdatedNumberFormat,
  useHookWithFormattedValue,
} from "./sheet-hooks";
import { AutocompleteHandler } from "../notebook/NotebookCellEditor/types";
import { EditorView } from "@codemirror/view";
import { EditorStateConfig } from "@codemirror/state";
import { Box, Theme } from "@mui/material";
import { getCellOriginalValue } from "../RenderTools";
import {
  GridElement,
  SheetLocation,
  SheetUnawareCellAttributeUpdate,
} from "../SheetUtils";
import { ReactComponent as FxIcon } from "../icons/fx.svg";
import { SystemStyleObject } from "@mui/system";
import { CodeMirrorApi } from "../codemirror-editor/CodeMirror";
import SvgIcon from "@mui/material/SvgIcon";
import { CellChangeWithRowCol, CurrentCellContent } from "./NeptyneSheet";
import SheetCodeEditor from "./SheetCodeEditor/sheetCodeEditor";

export interface TopCodeEditorProps {
  cell: GridElement;
  activeRow: number;
  activeColumn: number;
  getAutocomplete: AutocompleteHandler;
  value: string;
  readOnly: boolean;
  onSubmit: (value: string) => void;
  onTabSubmit: (value: string) => void;
  isSelectingWhileEditing: boolean;
  selection?: EditorStateConfig["selection"];
  onTopEditorClick: () => void;
  onUpdateCellValues: (updates: CellChangeWithRowCol[]) => void;
  onCellAttributeChange: (changes: SheetUnawareCellAttributeUpdate[]) => void;
  onUpdate?: (value: Partial<CurrentCellContent>) => void;
  editorViewFactory?: (config?: any) => EditorView;
  onEditingChange: (editing: SheetLocation | {}) => void;
  onCancel: () => void;
  onBlur: () => void;
}

const fxIconSize = 17;

const fxIconGap = 10;

const containerSX: SystemStyleObject = {
  position: "relative",
  overflow: "hidden",
  ".cm-scroller": {
    // Hide scrollbar on spec-compliant browsers
    // https://drafts.csswg.org/css-scrollbars-1/#propdef-scrollbar-width
    scrollbarWidth: "none",
    // Hide scrollbar on old MS (non-webkit) browsers
    msOverflowStyle: "none",
    // Hide scrollbar on webkit browsers
    "&::-webkit-scrollbar": {
      display: "none",
    },
  },
};

const fxIconSX = (theme: Theme) => ({
  color: "grey.800",
  height: fxIconSize,
  left: fxIconGap,
  position: "absolute",
  pointerEvents: "none",
  top: "50%",
  transform: "translateY(-50%)",
  width: `${fxIconSize + fxIconGap}px`,
  borderRight: `1px solid ${theme.palette.grey[400]}`,
  paddingRight: `${fxIconGap}px`,
});

const editorElementAttributes: React.HTMLAttributes<HTMLDivElement> = {
  style: {
    padding: `5px 0 5px ${fxIconSize + fxIconGap * 2.5}px`,
    height: "100%",
    boxSizing: "border-box",
  },
};

export const TopCodeEditor = forwardRef<CodeMirrorApi, TopCodeEditorProps>(
  (props, ref) => {
    const {
      cell,
      isSelectingWhileEditing,
      onSubmit,
      onUpdate,
      onTopEditorClick,
      onUpdateCellValues,
      onCellAttributeChange,
      onEditingChange,
      onCancel,
      onBlur,
      ...rest
    } = props;
    const { activeColumn, activeRow, value } = props;
    const hasSubmittedValue = useRef(false);

    const handleUpdateCellValue = useCallback(
      (updates: CellChangeWithRowCol[]) => {
        if (!hasSubmittedValue.current) {
          hasSubmittedValue.current = true;
          onUpdateCellValues(updates);
        }
      },
      [onUpdateCellValues]
    );

    const onClick = useCallback(() => {
      onEditingChange({ col: activeColumn, row: activeRow });
      // during the `selection while editing` if we will click on the top editor
      // we need to move selection to the activeRow/activeColumn
      // to prevent submit to the incorrect cell
      // and finish selection process.
      if (isSelectingWhileEditing) {
        onTopEditorClick();
      }
    }, [
      onTopEditorClick,
      isSelectingWhileEditing,
      onEditingChange,
      activeColumn,
      activeRow,
    ]);

    const onSubmitCallback = useCallback(
      (value?: string) => {
        if (value) {
          onSubmit(getCellOriginalValue(value));
          hasSubmittedValue.current = true;
        }
      },
      [onSubmit]
    );

    const [editorValue, handleSubmit, handleUpdate] = useHookWithFormattedValue(
      cell,
      activeRow,
      activeColumn,
      value,
      false,
      isSelectingWhileEditing,
      handleUpdateCellValue,
      onCellAttributeChange,
      onSubmitCallback,
      onUpdate
    );

    const handleBlur = useCallback(() => {
      const returnValue = getCellOriginalValue(editorValue);
      const isUpdated = returnValue !== cell.expression;
      if (isUpdated && !hasSubmittedValue.current) {
        handleUpdateCellValue([
          {
            row: activeRow,
            col: activeColumn,
            value: returnValue,
            attributes: getAttributesWithUpdatedNumberFormat(
              editorValue,
              cell.attributes || {}
            ),
          },
        ]);
      }
      onBlur();
    }, [
      handleUpdateCellValue,
      editorValue,
      activeRow,
      activeColumn,
      cell.expression,
      cell.attributes,
      onBlur,
    ]);

    const handleCancel = useCallback(() => {
      hasSubmittedValue.current = true;
      onCancel();
    }, [onCancel]);

    return (
      <Box
        className="top-code-editor-wrapper"
        data-testid="top-code-editor"
        onClick={onClick}
        sx={containerSX}
      >
        <SvgIcon sx={fxIconSX}>
          <FxIcon />
        </SvgIcon>
        <SheetCodeEditor
          ref={ref}
          {...rest}
          value={editorValue}
          onUpdate={handleUpdate}
          onBlur={handleBlur}
          elementProps={editorElementAttributes}
          onCancel={handleCancel}
          onSubmit={handleSubmit}
        />
      </Box>
    );
  }
);
