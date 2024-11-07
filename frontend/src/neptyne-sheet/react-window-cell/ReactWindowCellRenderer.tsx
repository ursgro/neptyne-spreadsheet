import { CSSProperties, FunctionComponent, useMemo } from "react";
import { GridChildComponentProps } from "react-window";
import { Dimension } from "../../NeptyneProtocol";
import { SheetLocation, colIxToA1 } from "../../SheetUtils";
import { CellHeader } from "../CellHeader";
import { visibleToGlobalIndex } from "../GridView";
import { GridData } from "../VirtualizedGrid";
import { NeptyneCellRenderer } from "./NeptyneCellRenderer";

/**
 * The name is depatable.
 *
 * React-window treats both headers and regular cells as the same children, so I wanted to separate
 * "is this cell or header?" logic and "how should we render DataCell?" logic.
 */
export const ReactWindowCellRenderer: FunctionComponent<
  GridChildComponentProps<GridData>
> = (props) => {
  const {
    columnIndex: reactWindowColumnIndex, // Horizontal (column) index of cell
    rowIndex: reactWindowRowIndex,
    style,
    data,
  } = props;

  const key = getKey(reactWindowRowIndex, reactWindowColumnIndex);

  const memoizedStyle = useHeaderStyles(
    style,
    reactWindowRowIndex,
    reactWindowColumnIndex
  );

  if (reactWindowRowIndex === 0 && reactWindowColumnIndex === 0) {
    return <div key={key} />;
  }

  const isHeader = reactWindowColumnIndex === 0 || reactWindowRowIndex === 0;

  let visibleRowIndex = reactWindowRowIndex - 1;
  let visibleColIndex = reactWindowColumnIndex - 1;

  if (isHeader) {
    const globalRowIndex = visibleToGlobalIndex(visibleRowIndex, data.hiddenRowHeaders);
    const globalColIndex = visibleToGlobalIndex(
      visibleColIndex,
      data.hiddenColHeaders || []
    );
    const dimension = reactWindowColumnIndex === 0 ? Dimension.Row : Dimension.Col;
    const { title, globalIndex, location, hasPrevUnHideButton, hasNextUnHideButton } =
      getHeaderArgs(
        dimension,
        globalRowIndex,
        globalColIndex,
        data.hiddenRowHeaders,
        data.hiddenColHeaders,
        data.activeCellLocation
      );

    return (
      <div style={memoizedStyle} key={key}>
        <CellHeader
          isActive={globalIndex === location}
          title={title}
          dimension={dimension}
          size={10}
          globalIndex={globalIndex}
          hasPrevUnHideButton={hasPrevUnHideButton} // TODO
          hasNextUnHideButton={hasNextUnHideButton} // TODO
          isContextMenuVisible={data.isContextMenuVisible}
          onHeaderClick={
            dimension === Dimension.Row ? data.onClickRow : data.onClickColumn
          }
          onHandleHeaderResize={data.onHandleHeaderResize}
          onContextMenu={data.setContextMenuPosition}
          onHeaderUnhideClick={data.handleHeaderUnhideClick}
          onHeaderContextMenu={data.handleHeaderContextMenu}
        />
      </div>
    );
  }

  return (
    <NeptyneCellRenderer
      {...props}
      cellKey={key}
      col={visibleColIndex}
      row={visibleRowIndex}
    />
  );
};

const getKey = (row: number, col: number) => `${row}-${col}`;

const useHeaderStyles = (
  style: CSSProperties,
  reactWindowRowIndex: number,
  reactWindowColumnIndex: number
) =>
  useMemo(() => {
    if (reactWindowRowIndex === 0 && reactWindowColumnIndex === 0) {
      return {};
    } else if (reactWindowRowIndex === 0) {
      return {
        textAlign: "center",
        height: "100%",
        width: "100%",
        ...style,
      };
    } else if (reactWindowColumnIndex === 0) {
      return {
        textAlign: "center",
        height: "100%",
        width: "100%",
        ...style,
      };
    } else {
      return;
    }
  }, [style, reactWindowRowIndex, reactWindowColumnIndex]);

const getHeaderArgs = (
  dimension: Dimension,
  globalRowIndex: number,
  globalColIndex: number,
  hiddenRows: number[],
  hiddenCols: number[],
  activeCellLocation: SheetLocation
) => {
  const globalIndex = dimension === Dimension.Row ? globalRowIndex : globalColIndex;

  const title =
    dimension === Dimension.Row ? `${globalIndex + 1}` : colIxToA1(globalIndex);

  const hiddenDimension = dimension === Dimension.Row ? hiddenRows : hiddenCols;
  const location =
    dimension === Dimension.Row ? activeCellLocation.row : activeCellLocation.col;
  const hasPrevUnHideButton =
    (hiddenDimension || []).filter((headerIndex) => headerIndex === globalIndex - 1)
      .length > 0;
  const hasNextUnHideButton =
    (hiddenDimension || []).filter((headerIndex) => headerIndex === globalIndex + 1)
      .length > 0;

  return { title, globalIndex, location, hasPrevUnHideButton, hasNextUnHideButton };
};
