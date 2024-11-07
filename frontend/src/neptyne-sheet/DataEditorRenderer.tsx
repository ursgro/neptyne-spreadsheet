import { FunctionComponent, useCallback, useContext, useMemo, useRef } from "react";

import ReactDataSheet from "../react-datasheet";
import { noop } from "../codemirror-editor/CodeMirror";
import { AutocompleteHandler } from "../notebook/NotebookCellEditor/types";
import {
  GridElement,
  isFormulaValue,
  SheetUnawareCellAttributeUpdate,
} from "../SheetUtils";
import { CellEditMode } from "./CellEditMode";
import {
  CellChangeWithRowCol,
  CurrentCellContent,
  CurrentValueContext,
} from "./NeptyneSheet";
import { EditorSelection, EditorStateConfig } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import {
  getAttributesWithUpdatedNumberFormat,
  useHookWithFormattedValue,
} from "./sheet-hooks";
import { KeyBinding } from "@codemirror/view";
import { CellAttribute } from "../NeptyneProtocol";
import { getCellOriginalValue, toCodemirrorValue } from "../RenderTools";
import { DEFAULT_FONT_SIZE } from "../components/ToolbarControls/FontSizeSelect";

export interface DataEditorRendererProps
  extends ReactDataSheet.DataEditorProps<GridElement> {
  activeRow: number;
  activeColumn: number;
  isEditMode: boolean;
  onUpdateCellValues: (updates: CellChangeWithRowCol[]) => void;
  getAutocomplete: AutocompleteHandler;
  value: string;
  gridValue: string | number | null;
  isSelectingWhileEditing: boolean;
  isEditingFromTopEditor: boolean;
  onCellAttributeChange: (changes: SheetUnawareCellAttributeUpdate[]) => void;
  readOnly: boolean;
  selection?: EditorStateConfig["selection"];
  onUpdate?: (value: Partial<CurrentCellContent>) => void;
}

const DataEditorRendererWithCurrentValue: FunctionComponent<
  DataEditorRendererProps
> = ({
  activeRow,
  activeColumn,
  isEditMode,
  isEditingFromTopEditor,
  onUpdateCellValues,
  onUpdate = noop,
  getAutocomplete,
  value,
  gridValue,
  isSelectingWhileEditing,
  selection,
  readOnly,
  onCellAttributeChange,
  onFinishEditing,
  cell,
  clearing,
  onNavigate,
}) => {
  const hasSubmittedValue = useRef(false);
  const canceling = useRef(false);

  // Cell value that comes from application. It takes priority over user input if changed
  const valueFromGrid = useMemo(() => toCodemirrorValue(gridValue), [gridValue]);

  const handleCancel = useCallback(() => {
    canceling.current = true;
    if (isSelectingWhileEditing) {
      return;
    }
    onUpdate({
      value: valueFromGrid,
      dynamicContentStart: valueFromGrid.length,
      dynamicContentEnd: valueFromGrid.length,
      editorSelection: EditorSelection.single(valueFromGrid.length),
    });
    onFinishEditing();
    canceling.current = false;
  }, [isSelectingWhileEditing, onFinishEditing, onUpdate, valueFromGrid]);

  const onSubmitCallback = useCallback(() => {
    if (isSelectingWhileEditing) {
      return;
    }
    hasSubmittedValue.current = true;
  }, [hasSubmittedValue, isSelectingWhileEditing]);

  const [editorValue, handleSubmit, handleUpdate] = useHookWithFormattedValue(
    cell,
    activeRow,
    activeColumn,
    value,
    isEditMode,
    isSelectingWhileEditing,
    onUpdateCellValues,
    onCellAttributeChange,
    onSubmitCallback,
    onUpdate
  );

  const handleBlur = useCallback(
    (event: FocusEvent, view: EditorView) => {
      if (canceling.current) {
        return;
      }
      const newValue = view.state.doc.toString();
      if (
        newValue !== valueFromGrid &&
        !isSelectingWhileEditing &&
        !hasSubmittedValue.current
      ) {
        const returnValue = getCellOriginalValue(newValue);
        onUpdateCellValues([
          {
            row: activeRow,
            col: activeColumn,
            value: returnValue,
            attributes: getAttributesWithUpdatedNumberFormat(
              newValue,
              cell?.attributes || {}
            ),
          },
        ]);
        onFinishEditing(false);
      }
    },
    [
      activeRow,
      activeColumn,
      valueFromGrid,
      onUpdateCellValues,
      onFinishEditing,
      isSelectingWhileEditing,
      cell?.attributes,
    ]
  );

  const keyBindings: KeyBinding[] = useMemo(
    () =>
      clearing
        ? [
            { key: "ArrowLeft", row: 0, col: -1 },
            { key: "ArrowRight", row: 0, col: 1 },
            { key: "ArrowUp", row: -1, col: 0 },
            { key: "ArrowDown", row: 1, col: 0 },
          ].map(({ key, row, col }) => ({
            key,
            preventDefault: false,
            run: (view) => {
              if (isFormulaValue(view.state.doc.toString())) {
                return false;
              }
              handleSubmit(view.state.doc.toString());
              onFinishEditing();
              onNavigate(row, col);
              return true;
            },
          }))
        : [],
    [clearing, handleSubmit, onFinishEditing, onNavigate]
  );

  const extensions = useMemo(
    () => [
      EditorView.theme({
        ".cm-content": {
          fontSize: `${
            cell.attributes?.[CellAttribute.FontSize] || DEFAULT_FONT_SIZE
          }pt`,
        },
        ".cm-scroller": {
          lineHeight: "0.8",
        },
      }),
    ],
    [cell]
  );

  return (
    <CellEditMode
      readOnly={readOnly}
      autofocus={!isEditingFromTopEditor && !isSelectingWhileEditing}
      // TODO: to be removed
      activeRow={activeRow}
      activeColumn={activeColumn}
      value={editorValue}
      onBlur={handleBlur}
      onCancel={handleCancel}
      getAutocomplete={getAutocomplete}
      onUpdate={handleUpdate}
      onSubmit={handleSubmit}
      onTabSubmit={handleSubmit}
      selection={selection}
      extraKeyBindings={keyBindings}
      extensions={extensions}
    />
  );
};

export const DataEditorRenderer: FunctionComponent<DataEditorRendererProps> = (
  props
) => {
  const { value, editorSelection } = useContext(CurrentValueContext)!;
  return (
    <DataEditorRendererWithCurrentValue
      {...props}
      value={props.isEditMode ? value : props.value}
      selection={editorSelection || props.selection}
    />
  );
};
