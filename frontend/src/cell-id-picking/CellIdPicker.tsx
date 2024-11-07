import { observer } from "mobx-react";
import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import {
  BaseCodeEditor,
  BaseCodeEditorProps,
} from "../codemirror-editor/BaseCodeEditor/BaseCodeEditor";
import { CodeMirrorApi } from "../codemirror-editor/CodeMirror";
import { CellIdPickingStore, useCellIdPickingContext } from "./cell-id-picking.store";
import { EditorSelection, EditorStateConfig } from "@codemirror/state";
import { conflictingHotKeys } from "../hotkeyConstants";
import { useComposedRef } from "../use-composed-ref";
import { toJS } from "mobx";
import { EditorView, ViewUpdate } from "@codemirror/view";

const noop = () => {};

export interface CellIdPickerProps extends BaseCodeEditorProps {}

export const CellIdPicker = observer(
  forwardRef<CodeMirrorApi, BaseCodeEditorProps>(
    ({ onUpdate = noop, value: propValue, selection: propSelection, ...rest }, ref) => {
      const innerRef = useRef<CodeMirrorApi>(null);
      const composedRef = useComposedRef(innerRef, ref);
      const cellIdPickingStore = useCellIdPickingContext();
      const [editorValue, setEditorValue] = useState<{
        value: string;
        editorSelection: EditorStateConfig["selection"];
      }>({
        value: "",
        editorSelection: EditorSelection.single(0),
      });

      const isCurrentEditor =
        !!cellIdPickingStore.currentEditorView?.dom &&
        innerRef.current?.isSameDomElement(cellIdPickingStore.currentEditorView?.dom);

      useEffect(() => {
        const cursorPosition = propSelection
          ? // @ts-ignore
            propSelection.anchor || propSelection.main.anchor
          : propValue?.length || 0;
        const selection = propSelection || EditorSelection.single(cursorPosition);
        if (isCurrentEditor) {
          cellIdPickingStore.handleValueChangeFromProps(
            propValue as string,
            selection,
            cursorPosition
          );
        }
        setEditorValue({
          value: propValue as string,
          editorSelection: selection,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [propValue]);

      const handleUpdate = useCallback(
        (viewUpdate: ViewUpdate) => {
          const updateObj: Partial<CellIdPickingStore> = {};
          if (viewUpdate.selectionSet) {
            updateObj.editorSelection = viewUpdate.state.selection;
          }
          if (viewUpdate.docChanged) {
            updateObj.value = viewUpdate.state.doc.toString() || "";
          }
          if (Object.keys(updateObj).length) {
            if (isCurrentEditor) {
              cellIdPickingStore.handleValueChange(viewUpdate);
            }
            setEditorValue((prev) => ({ ...prev, ...updateObj }));
          }
          onUpdate(viewUpdate);
        },
        [onUpdate, cellIdPickingStore, isCurrentEditor]
      );

      const handleFocus = useCallback(
        (view: EditorView) => cellIdPickingStore.handleFocus(view),
        [cellIdPickingStore]
      );

      // hacky way to enforce prop update. CodeMirror relies on prop update to set focus
      const { value, editorSelection } = toJS(cellIdPickingStore);

      return (
        <BaseCodeEditor
          ref={composedRef}
          {...rest}
          value={isCurrentEditor ? value : editorValue.value}
          selection={isCurrentEditor ? editorSelection : editorValue.editorSelection}
          onUpdate={handleUpdate}
          // TODO: probably should remove when finished. Now we need it to supress delete hotkey
          mutedHotKeys={conflictingHotKeys}
          onFocus={handleFocus}
        />
      );
    }
  )
);
