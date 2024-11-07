import { withProfiler } from "../../test-profiler";
import { DataEditorRendererProps as EditorProps } from "../DataEditorRenderer";
import { EditorSelection } from "@codemirror/state";

export const DataEditorRendererProps = jest.requireActual(
  "../DataEditorRenderer"
).DataEditorRendererProps;

export const DataEditorRenderer = withProfiler((props: EditorProps) => {
  const { value, onChange, onUpdate } = props;

  return (
    <input
      ref={(node) => node?.focus()}
      className="data-editor"
      value={value}
      onChange={(e) => {
        const value = e.target.value;
        onChange(value);
        onUpdate &&
          onUpdate({
            value: value,
            dynamicContentEnd: value.length,
            dynamicContentStart: value.length,
            editorSelection: EditorSelection.single(value.length),
          });
      }}
    />
  );
});
