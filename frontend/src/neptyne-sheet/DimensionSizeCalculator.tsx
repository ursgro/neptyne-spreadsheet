import { Box } from "@mui/material";
import { CSSProperties, FunctionComponent, useCallback, useMemo } from "react";
import { useWidthCalculation } from "../components/ToolbarControls/AdaptiveToolbar/use-width-calculation";
import {
  CellAttribute,
  Dimension,
  LineWrap,
  LineWrapDefault,
} from "../NeptyneProtocol";
import DataCell from "../react-datasheet/src/DataCell";
import { GridElement } from "../SheetUtils";
import { DEFAULT_CELL_HEIGHT, SCROLL_BAR_SIZE } from "./GridView";

interface DimensionSizeCalculatorProps {
  grid: GridElement[][];
  dimension: Dimension;
  indices: number[];
  resizeColWidth?: number[];
  onSizeCalclated: (sizes: number[]) => void;
}

const WRAPPER_SX = {
  width: "100%",
  height: "100%",
  paddingBottom: SCROLL_BAR_SIZE + "px",
  paddingRight: SCROLL_BAR_SIZE + "px",
  boxSizing: "border-box",
};

const ERASE_PADDING_SX = { padding: "0px" };
const WITH_PADDING_SX = { padding: undefined };

const DEFAULT_SIZE = {
  height: `${DEFAULT_CELL_HEIGHT}px`,
};

export const DimensionSizeCalculator: FunctionComponent<
  DimensionSizeCalculatorProps
> = ({ grid, dimension, indices, resizeColWidth, onSizeCalclated }) => {
  const data: (GridElement | undefined)[][] =
    dimension === Dimension.Row
      ? indices.map(
          (index) => grid[index]?.map((cell) => (cell.value ? cell : undefined)) || []
        )
      : grid.map((row) =>
          indices.map((index) => (row[index]?.value ? row[index] : undefined))
        );

  const stylesByCol = useMemo(() => {
    const stylesByColDict: { [key: number]: CSSProperties } = {};
    data.forEach((row, rowIdx) =>
      row.forEach((cell, cellIdx) => {
        if (!cell) return;

        stylesByColDict[cellIdx] = {
          minHeight: `${DEFAULT_CELL_HEIGHT - 2}px`,
          padding: "0px",
        };
      })
    );
    return stylesByColDict;
  }, [data]);

  const dimensionRenderer = useMemo(
    () => (
      <Box sx={WRAPPER_SX}>
        <div>
          <span
            className="data-grid-container"
            data-testid="calculator-data-grid-container"
          >
            <table className="data-grid">
              <tbody id="dimension-size-grid">
                {data.map((row, rowIdx) => (
                  <tr key={rowIdx}>
                    {row.map((cell, cellIdx) => {
                      if (!cell)
                        return (
                          <td style={DEFAULT_SIZE}>
                            <div></div>
                          </td>
                        );
                      return (
                        <td
                          key={`${rowIdx}-${cellIdx}`}
                          style={cell.value ? ERASE_PADDING_SX : WITH_PADDING_SX}
                        >
                          <MockedCell
                            cell={cell}
                            style={
                              resizeColWidth &&
                              (cell.attributes?.[CellAttribute.LineWrap] ??
                                LineWrapDefault) === LineWrap.Wrap
                                ? {
                                    ...stylesByCol[cellIdx],
                                    ...{
                                      width: resizeColWidth[cellIdx],
                                    },
                                  }
                                : stylesByCol[cellIdx]
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </span>
        </div>
      </Box>
    ),
    [data, resizeColWidth, stylesByCol]
  );

  const handleInitialComponentsMount = useCallback(
    (elements: Element[]) => {
      const tbody = elements[0].querySelector("#dimension-size-grid");
      if (!tbody) return [];
      onSizeCalclated(
        dimension === Dimension.Row
          ? Array.from(tbody.children).map((row) => row.getBoundingClientRect().height)
          : Array.from(Array.from(tbody.children)[0].children).flatMap((row) =>
              Array.from(row.children).map((cell) => cell.getBoundingClientRect().width)
            )
      );
    },
    [dimension, onSizeCalclated]
  );

  const calculatorComponent = useWidthCalculation(
    dimensionRenderer,
    handleInitialComponentsMount
  );

  return <>{calculatorComponent}</>;
};

const noop = () => Promise.resolve({ result: [] });

interface MockedCellProps {
  cell: GridElement;
  style?: CSSProperties;
}

export const MockedCell: FunctionComponent<MockedCellProps> = ({
  cell,
  style = {},
}) => (
  <DataCell
    cell={cell}
    col={0}
    row={0}
    highlightColorIdx={undefined}
    isEditMode={false}
    isCurrentCell={false}
    isTheOnlyCellSelected={false}
    isInSelection={false}
    isCodeCell={false}
    isFrozenRowBound={false}
    isFrozenColBound={false}
    isReadOnly={false}
    isSearchHighlighted={false}
    isSearchSelected={false}
    hasAutoFillDragControl={false}
    isSelectingWhileEditing={false}
    isEditingFromTopEditor={false}
    callServerMethod={noop}
    onWidgetChange={noop}
    onAutofillDragStart={noop}
    onAutofillCellMove={noop}
    onAutofillDragStop={noop}
    onNavigate={noop}
    onMouseDown={noop}
    onSelectCell={noop}
    onMouseOver={noop}
    onDoubleClick={noop}
    onContextMenu={noop}
    onChange={noop}
    onFinishEditing={noop}
    onUpdateCellValues={noop}
    getAutocomplete={noop}
    onCellAttributeChange={noop}
    onDataEditorUpdate={noop}
    style={style}
  />
);
