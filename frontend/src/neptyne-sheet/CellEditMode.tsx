import { EditorView } from "@codemirror/view";
import { useTheme } from "@mui/material";
import {
  CSSProperties,
  FunctionComponent,
  useCallback,
  useMemo,
  useState,
} from "react";
import { DEFAULT_CELL_HEIGHT, DEFAULT_CELL_WIDTH } from "./GridView";
import SheetCodeEditor, {
  SheetCodeEditorProps,
} from "./SheetCodeEditor/sheetCodeEditor";

export interface CellEditModeProps extends SheetCodeEditorProps {}

export const CellEditMode: FunctionComponent<CellEditModeProps> = (props) => {
  const extensions = useMemo(
    () => [EditorView.lineWrapping, ...(props.extensions || [])],
    [props.extensions]
  );

  const [minHeight, setMinHeight] = useState(0);
  const [maxHeight, setMaxHeight] = useState(0);
  const [maxWidth, setMaxWidth] = useState(0);
  const [minWidth, setMinWidth] = useState(0);

  const theme = useTheme();

  const measuredRef = useCallback((node: HTMLDivElement) => {
    if (node !== null) {
      const viewportRect =
        node.parentElement?.parentElement?.parentElement?.getBoundingClientRect();

      const cellWidth = node.parentElement!.clientWidth ?? DEFAULT_CELL_WIDTH;
      const cellHeight = node.parentElement!.clientHeight ?? DEFAULT_CELL_HEIGHT;

      const editorRect = node.getBoundingClientRect();
      setMaxHeight(
        viewportRect && editorRect ? viewportRect?.bottom - editorRect.y : 0
      );
      setMaxWidth(viewportRect && editorRect ? viewportRect?.right - editorRect.x : 0);
      setMinWidth(cellWidth);
      setMinHeight(cellHeight);
    }
  }, []);

  const editorWrapperStyles: CSSProperties = useMemo(
    () => ({
      position: "fixed",
      maxWidth,
      minWidth,
      maxHeight,
      minHeight,
      zIndex: theme.zIndex.gridPopover,
      backgroundColor: "white",
      marginTop: -1,
      outline: "2px solid rgb(33, 133, 208)",
      MozBoxShadow: "0 0 5px #000",
      WebkitBoxShadow: "0 0 5px #000",
      boxShadow: "0 0 5px 1px #000",
    }),
    [maxHeight, maxWidth, minWidth, minHeight, theme.zIndex.gridPopover]
  );

  const elementProps = useMemo(
    () => ({
      className: "cell-code-container",
      style: {
        maxHeight,
        minHeight,
      } as CSSProperties,
    }),
    [maxHeight, minHeight]
  );

  return (
    <div ref={measuredRef} style={editorWrapperStyles}>
      <SheetCodeEditor elementProps={elementProps} {...props} extensions={extensions} />
    </div>
  );
};
