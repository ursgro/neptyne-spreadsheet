import React, { FunctionComponent, memo } from "react";
import ReactDataSheet from "../types/react-datasheet";
import { GridElement } from "../../SheetUtils";
import { CellAttribute } from "../../NeptyneProtocol";
import { DEFAULT_FONT_SIZE } from "../../components/ToolbarControls/FontSizeSelect";

const ValueViewer: FunctionComponent<ReactDataSheet.ValueViewerProps<GridElement>> =
  memo(({ value, cell }) => (
    <span
      className="value-viewer"
      style={{
        fontSize: `${cell.attributes?.[CellAttribute.FontSize] || DEFAULT_FONT_SIZE}pt`,
      }}
    >
      <span className="value">{value}</span>
    </span>
  ));

export default ValueViewer;
