import React, {
  CSSProperties,
  FunctionComponent,
  MouseEventHandler,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import dayjs from "dayjs";
import {
  alpha,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  MenuItem,
  Select,
  SxProps,
  TextField,
  Theme,
  Tooltip,
  tooltipClasses,
  useTheme,
} from "@mui/material";
import TinyGesture from "tinygesture";
import _ from "lodash";
import ContentCut from "@mui/icons-material/ContentCut";
import {
  DatePicker,
  DateTimePicker,
  LocalizationProvider,
  TimePicker,
} from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { CellAttribute } from "../NeptyneProtocol";
import {
  ALLOWED_FONTS,
  attributesToCssClass,
  CellAttributes,
  getVerticalAlignClasses,
  GridElement,
  hasOverlappingWidget,
} from "../SheetUtils";
import { Icon as FeatherIcon } from "react-feather";
import { DebouncedCommitSlider } from "../components/DebouncedCommitSlider";
import { excelDateToJSDate, jsDateToExcelDate } from "../excelDates";
import { SystemStyleObject } from "@mui/system";
import { isMobile } from "react-device-detect";
import { styled } from "@mui/material/styles";

import { dependsOnColors } from "../SheetUtils";
import { TooltipProps } from "@mui/material/Tooltip/Tooltip";

export interface CellContextMenuAction {
  type: string;

  // that's debatable, but I did not want to pull complex type declaration from library
  icon: typeof ContentCut | FeatherIcon;

  title: string;
  shortcut?: string;
}

export interface NeptyneCellProps {
  row: number;
  col: number;
  cell: GridElement;
  className: string;
  editing: boolean;
  children: ReactNode;
  isServerPending: boolean;
  isEditMode: boolean;
  isCurrentCell: boolean;
  isCodeCell: boolean;
  isTheOnlyCellSelected: boolean;
  inSelection: boolean;
  isFrozenColBound: boolean;
  isFrozenRowBound: boolean;
  isSearchHighlighted: boolean;
  isSearchSelected: boolean;
  hasTopAutoFillBorder?: boolean;
  hasRightAutoFillBorder?: boolean;
  hasBottomAutoFillBorder?: boolean;
  hasLeftAutoFillBorder?: boolean;
  hasTopCutBorder?: boolean;
  hasRightCutBorder?: boolean;
  hasBottomCutBorder?: boolean;
  hasLeftCutBorder?: boolean;
  hasTopCopyFormatBorder?: boolean;
  hasRightCopyFormatBorder?: boolean;
  hasBottomCopyFormatBorder?: boolean;
  hasLeftCopyFormatBorder?: boolean;
  areGridlinesHidden?: boolean;
  readOnly: boolean;
  showAutofillDragControl: boolean;
  isRootMerge?: boolean;
  onMouseDown: MouseEventHandler<HTMLElement>;
  onMouseOver: MouseEventHandler<HTMLElement>;
  onDoubleClick: MouseEventHandler<HTMLElement>;
  onDoubleTap: () => void;
  onContextMenu: MouseEventHandler<HTMLElement>;
  callServerMethod: (
    method: string,
    args: string[],
    kwargs: { [param: string]: any }
  ) => Promise<any>;
  onWidgetChange: (
    row: number,
    col: number,
    newVal: boolean | string | number | null
  ) => void;
  onAutofillDragStart: (row: number, col: number) => void;
  onAutofillDragStop: (row: number, col: number) => void;
  onAutofillDragCellMove: (row: number, col: number) => void;
  style: CSSProperties;
  highlightColorIdx: number | undefined;
  testId?: string;
}

// TODO: get rid of importance after styling refactor
const AUTO_FILL_BORDER_STYLE = "1px dashed black !important";
const getCutBorderStyle = (theme: Theme) =>
  `1px dashed ${theme.palette.secondary.main} !important`;

const DATETIME_PICKER_SX = {
  "& .MuiInputBase-input.MuiOutlinedInput-input": {
    paddingLeft: "2px",
    paddingRight: "0px",
    paddingY: "0px",
    letterSpacing: "0px",
  },
  "& .MuiButtonBase-root.MuiIconButton-root": {
    padding: "0",
  },
  "& .MuiSvgIcon-root": {
    width: ".65em",
    height: ".65em",
  },
};

const StyledUrlToolTip = styled(({ className, ...props }: TooltipProps) => (
  <Tooltip {...props} arrow classes={{ popper: className }} />
))(({ theme }) => ({
  [`& .${tooltipClasses.arrow}`]: {
    color: "#E0E0E0",
  },
  [`& .${tooltipClasses.tooltip}`]: {
    backgroundColor: "#E0E0E0",
    margin: 0,
    fontSize: 16,
  },
}));

interface UrlToolTipProps extends TooltipProps {
  forceOpen: boolean;
}

const UrlToolTip = ({ forceOpen, ...tooltipProps }: UrlToolTipProps) => {
  const [open, setOpen] = React.useState(false);

  const { children, onOpen, onClose, ...rest } = tooltipProps;

  const handleOpen = useCallback(
    (event: React.SyntheticEvent) => {
      setOpen(true);
      onOpen?.(event);
    },
    [onOpen]
  );

  const handleClose = useCallback(
    (event: React.SyntheticEvent | Event) => {
      setOpen(false);
      onClose?.(event);
    },
    [onClose]
  );

  return (
    <StyledUrlToolTip
      open={forceOpen || open}
      onOpen={handleOpen}
      onClose={handleClose}
      {...rest}
    >
      {children}
    </StyledUrlToolTip>
  );
};

const NoteToolTip = styled(({ className, ...props }: TooltipProps) => (
  <Tooltip {...props} arrow classes={{ popper: className }} />
))(({ theme }) => ({
  [`& .${tooltipClasses.arrow}`]: {
    color: "#D09090",
  },
  [`& .${tooltipClasses.tooltip}`]: {
    backgroundColor: "#D09090",
    margin: 0,
    fontSize: 14,
  },
}));

interface ConnectedAutoCompleteProps {
  value: string;
  choices: string[] | ((val: string) => Promise<any>);
  readOnly: boolean;
  row: number;
  col: number;
  onWidgetChange: (newVal: string | number | boolean | null) => void;
  baseSx: SxProps<Theme>;
  textColor: string;
  backgroundColor: string;
}

function stopWheelEventPropagation(event: WheelEvent) {
  event.stopPropagation();
}

const ConnectedAutoComplete: FunctionComponent<ConnectedAutoCompleteProps> = ({
  value,
  choices,
  readOnly,
  baseSx,
  onWidgetChange,
  textColor,
  backgroundColor,
}) => {
  const serverProvidedOptions = typeof choices === "function";
  const [inputValue, setInputValue] = React.useState("");
  const [options, setOptions] = React.useState<readonly string[]>(
    serverProvidedOptions ? [] : choices
  );

  const handleInputChange = useCallback(
    (ev: React.SyntheticEvent, newVal: string) => {
      setInputValue(newVal);
      if (serverProvidedOptions) {
        choices(newVal).then((value) => {
          setOptions(value.result);
        });
      }
    },
    [choices, serverProvidedOptions]
  );

  const [hasFetchedInitialData, setHasFetchedInitialData] = React.useState(false);

  useEffect(() => {
    if (!hasFetchedInitialData && serverProvidedOptions) {
      choices("").then((value) => {
        setOptions(value.result);
        setHasFetchedInitialData(true);
      });
    }
  }, [choices, hasFetchedInitialData, serverProvidedOptions]);

  // The default in the dataclass is "", but this is only valid in MUI autocomplete if it's in the list of options.
  // null is what MUI autocomplete uses to indicate a value has not been picked.
  const nullableValue = value === "" && !options.includes(value) ? null : value;

  return (
    <Autocomplete
      value={nullableValue}
      id="combo-box-demo"
      options={options}
      sx={[
        baseSx as SystemStyleObject,
        {
          width: "100%",
          maxHeight: "100%",
          "& .MuiOutlinedInput-root": {
            padding: "0",
            backgroundColor: backgroundColor,
            color: textColor,
          },
          "& .MuiInputBase-input.MuiAutocomplete-input.MuiOutlinedInput-input": {
            paddingX: "4px",
            paddingY: "0px",
            color: textColor,
          },
          "& .MuiAutocomplete-clearIndicator .MuiSvgIcon-root": {
            width: ".65em",
            height: ".65em",
          },
          "& .MuiAutocomplete-popupIndicator .MuiSvgIcon-root": {
            width: ".65em",
            height: ".65em",
          },
          "& .MuiAutocomplete-endAdornment": {
            right: "4px",
            top: "0",
          },
          "& .MuiAutocomplete-listbox": {
            backgroundColor: backgroundColor,
            color: textColor,
          },
          "& .MuiAutocomplete-option": {
            backgroundColor: backgroundColor,
            color: textColor,
          },
          backgroundColor: backgroundColor,
          color: textColor,
        },
      ]}
      renderInput={(params) => <TextField {...params} />}
      disabled={readOnly}
      onChange={(ev, newValue) => {
        onWidgetChange(newValue);
      }}
      onInputChange={handleInputChange}
      inputValue={inputValue}
    />
  );
};

function instantiateWidget(
  cell: GridElement,
  row: number,
  col: number,
  readOnly: boolean,
  onWidgetChange: (newVal: string | number | boolean | null) => void,
  callServerMethod: (
    method: string,
    args: string[],
    kwargs: { [param: string]: any }
  ) => Promise<any>
) {
  const widget = JSON.parse(cell.attributes![CellAttribute.Widget]);

  const defaultSx = (theme: Theme): SystemStyleObject<Theme> =>
    theme.typography.sheetButton;
  const widgetType = widget.widget;
  const backgroundColor =
    widget.background_color || (widgetType === "dropdown" ? "white" : "blue");
  const textColor =
    widget.text_color || (widgetType === "dropdown" ? "black" : "white");
  const disabled = readOnly || widget.disabled;
  const baseStyle = {
    paddingTop: "0",
    paddingBottom: "0",
    width: "100%",
    maxHeight: "100%",
    display: "flex",
  };
  let widgetComponent;
  switch (widgetType) {
    case "button":
      widgetComponent = (
        <Button
          sx={defaultSx}
          style={
            disabled
              ? { ...baseStyle, textTransform: "none" }
              : {
                  ...baseStyle,
                  ...{
                    backgroundColor: backgroundColor,
                    color: textColor,
                    textTransform: "none",
                  },
                }
          }
          variant="contained"
          onClick={() => {
            onWidgetChange(null);
          }}
          disabled={disabled}
        >
          {widget.caption || "Button"}
          {widget.is_spinning && (
            <CircularProgress sx={{ marginLeft: "4px" }} size={16} thickness={8} />
          )}
        </Button>
      );
      break;
    case "dropdown":
      const choices: string[] = widget.choices;
      widgetComponent = (
        <Select
          value={widget.value}
          multiple={widget.multi_select}
          sx={[
            defaultSx,
            baseStyle,
            {
              width: "100%",
              "& .MuiSelect-select": {
                margin: "0",
                padding: "4px 4px",
                ...baseStyle,
              },
              "& .MuiSvgIcon-root": {
                width: ".65em",
                height: ".65em",
                top: "auto",
              },
              backgroundColor: backgroundColor,
              color: textColor,
            },
          ]}
          onChange={(ev) => {
            onWidgetChange(ev.target.value);
          }}
          disabled={disabled}
        >
          {choices.map((choice, ix) => {
            return (
              <MenuItem key={ix} value={choice}>
                {choice}
              </MenuItem>
            );
          })}
        </Select>
      );
      break;
    case "slider":
      widgetComponent = (
        <DebouncedCommitSlider
          size="small"
          value={widget.value}
          sx={{
            width: "100%",
            maxHeight: "100%",
            color: backgroundColor,
            paddingY: "9px",
            paddingX: "0px",
          }}
          onCommit={(ev, newValue) => {
            onWidgetChange(Array.isArray(newValue) ? newValue[0] : newValue);
          }}
          disabled={disabled}
        />
      );
      break;
    case "checkbox":
      widgetComponent = (
        <Checkbox
          sx={[
            defaultSx,
            {
              padding: "0",
              color: backgroundColor,
              "& .MuiSvgIcon-root": {
                marginTop: "-5px",
              },
            },
          ]}
          size="small"
          checked={widget.value}
          onChange={(ev, newValue) => {
            onWidgetChange(newValue);
          }}
          disabled={disabled}
        />
      );
      break;
    case "autocomplete": {
      const choices: string[] | ((val: string) => Promise<any>) =
        typeof widget.choices === "string"
          ? (val) =>
              callServerMethod("call_autocomplete_handler", [val], {
                row,
                col,
              })
          : widget.choices
          ? widget.choices.filter(
              (choice: any) => choice !== null && choice !== undefined
            )
          : [];
      widgetComponent = (
        <ConnectedAutoComplete
          value={widget.value}
          choices={choices}
          readOnly={disabled}
          col={col}
          row={row}
          onWidgetChange={onWidgetChange}
          baseSx={defaultSx}
          backgroundColor={backgroundColor}
          textColor={textColor}
        />
      );
      break;
    }
    case "datetimepicker": {
      widgetComponent = (
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          {renderDatetimeWidget(widget, onWidgetChange, disabled)}
        </LocalizationProvider>
      );
      break;
    }
    default:
      widgetComponent = <span>Unknown widget: {widgetType}</span>;
  }
  return (
    <span className={`widget-viewer ${getVerticalAlignClasses(cell)}`}>
      {widgetComponent}
    </span>
  );
}

function renderDatetimeWidget(
  widget: any,
  onWidgetChange: (newVal: string | number | boolean | null) => void,
  disabled: boolean
) {
  const handler = (value: any) => {
    const dt = new Date(value);
    onWidgetChange(jsDateToExcelDate(dt));
  };
  const jsDate = widget.value ? dayjs(excelDateToJSDate(widget.value)) : dayjs();

  switch (widget.picker_type) {
    case "datetime":
      return (
        <DateTimePicker
          sx={DATETIME_PICKER_SX}
          value={jsDate}
          onChange={handler}
          disabled={disabled}
        />
      );
    case "date":
      return (
        <DatePicker
          sx={DATETIME_PICKER_SX}
          value={jsDate}
          onChange={handler}
          disabled={disabled}
        />
      );
    case "time":
      return (
        <TimePicker
          sx={DATETIME_PICKER_SX}
          value={jsDate}
          onChange={handler}
          disabled={disabled}
        />
      );
    default:
      return `Invalid picker_type: ${widget.picker_type}`;
  }
}

export const NeptyneCell: FunctionComponent<NeptyneCellProps> = React.memo((props) => {
  const {
    row,
    col,
    cell,
    editing,
    style,
    className,
    isEditMode,
    isServerPending,
    readOnly,
    isCodeCell,
    isTheOnlyCellSelected,
    inSelection,
    isFrozenColBound,
    isFrozenRowBound,
    areGridlinesHidden,
    showAutofillDragControl,
    onAutofillDragStart,
    onAutofillDragStop,
    onAutofillDragCellMove,
    onWidgetChange,
    callServerMethod,
    isCurrentCell,
    hasTopAutoFillBorder,
    hasRightAutoFillBorder,
    hasBottomAutoFillBorder,
    hasLeftAutoFillBorder,
    hasTopCutBorder,
    hasRightCutBorder,
    hasBottomCutBorder,
    hasLeftCutBorder,
    hasTopCopyFormatBorder,
    hasRightCopyFormatBorder,
    hasBottomCopyFormatBorder,
    hasLeftCopyFormatBorder,
    isSearchHighlighted,
    isSearchSelected,
    onDoubleTap,
    highlightColorIdx,
    testId,
    isRootMerge = false,
    ...rest
  } = props;
  let { children } = props;
  const isEditingCurrentCell = isCurrentCell && isEditMode;

  const showSpinner = isServerPending && !isEditingCurrentCell;

  const td = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  const cellStyle = getCellStyle(
    style,
    showAutofillDragControl,
    isFrozenColBound,
    isFrozenRowBound,
    isSearchHighlighted,
    isTheOnlyCellSelected,
    hasTopAutoFillBorder,
    hasRightAutoFillBorder,
    hasBottomAutoFillBorder,
    hasLeftAutoFillBorder,
    hasTopCutBorder,
    hasRightCutBorder,
    hasBottomCutBorder,
    hasLeftCutBorder,
    isSearchSelected,
    hasTopCopyFormatBorder,
    hasRightCopyFormatBorder,
    hasBottomCopyFormatBorder,
    hasLeftCopyFormatBorder,
    isEditingCurrentCell,
    inSelection,
    cell.attributes,
    theme.palette.secondary.lightBackground,
    highlightColorIdx
  );

  if (isRootMerge) {
    // Creating transformation root to prevent glitches on safari
    cellStyle.transform = "translate3d(0, 0, 0)";
  }

  const handleMouseEnter = useCallback(
    () => onAutofillDragCellMove(row, col),
    [row, col, onAutofillDragCellMove]
  );

  useEffect(() => {
    if (td.current && isEditingCurrentCell) {
      const cell = td.current;
      cell.addEventListener("wheel", stopWheelEventPropagation, { passive: false });
      return () => cell.removeEventListener("wheel", stopWheelEventPropagation);
    }
  }, [isEditingCurrentCell]);

  useEffect(() => {
    if (td.current && isMobile) {
      const gesture = new TinyGesture(td.current);
      gesture.on("doubletap", () => {
        onDoubleTap();
      });
      return () => gesture.destroy();
    }
  }, [onDoubleTap]);

  const debouncedWidgetChanged = useMemo(
    () => _.throttle((newVal) => onWidgetChange(row, col, newVal), 200),
    [row, col, onWidgetChange]
  );

  const cellClass = attributesToCssClass(
    cell,
    isCurrentCell,
    className,
    isCodeCell,
    isEditMode,
    areGridlinesHidden ?? false
  );

  let showingWidget = cell.attributes?.[CellAttribute.Widget] && !isEditingCurrentCell;
  if (showSpinner) {
    children = <CircularProgress sx={{ marginTop: "2px" }} size={14} thickness={8} />;
  } else {
    if (showingWidget) {
      children = instantiateWidget(
        cell,
        row,
        col,
        readOnly,
        debouncedWidgetChanged,
        callServerMethod
      );
    }
  }

  const SX: SxProps<Theme> | undefined = useMemo(() => {
    if (
      !cellStyle.borderTop &&
      !cellStyle.borderBottom &&
      !cellStyle.borderLeft &&
      !cellStyle.borderRight &&
      !(inSelection && !isTheOnlyCellSelected)
    ) {
      return undefined;
    }
    return {
      borderTop: cellStyle.borderTop,
      borderBottom: cellStyle.borderBottom,
      borderLeft: cellStyle.borderLeft,
      borderRight: cellStyle.borderRight,
      ...(inSelection && !isTheOnlyCellSelected
        ? {
            "&::before": {
              content: "''",
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              mixBlendMode: "darken",
              backgroundColor: (theme: Theme) => alpha(theme.palette.primary.main, 0.2),
            },
          }
        : {}),
    };
  }, [inSelection, isTheOnlyCellSelected, cellStyle]);

  let res = (
    <Box
      {...rest}
      data-testid={testId}
      ref={td}
      style={cellStyle}
      sx={{
        ...SX,
        borderTop: cellStyle.borderTop,
        borderBottom: cellStyle.borderBottom,
        borderLeft: cellStyle.borderLeft,
        borderRight: cellStyle.borderRight,
        ...(showSpinner ? { display: "flex", justifyContent: "flex-end" } : {}),
      }}
      className={cellClass}
      onMouseUp={() => onAutofillDragStop(row, col)}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (showingWidget) {
          e.stopPropagation();
        }
      }}
      onMouseDown={(e: React.MouseEvent<HTMLElement>) => {
        if (inSelection && e.button === 2) {
          return;
        }
        rest.onMouseDown(e);
      }}
      onMouseEnter={handleMouseEnter}
    >
      {hasOverlappingWidget(cell) ? null : children}
      {showAutofillDragControl && (
        <div
          id="autofill-drag-control"
          data-testid="autofill-drag-control"
          onMouseDown={(e) => {
            e.stopPropagation();
            if (window.getSelection) {
              window.getSelection()?.removeAllRanges();
            }
            onAutofillDragStart(row, col);
          }}
        />
      )}
    </Box>
  );

  if (cell.attributes?.[CellAttribute.Link]) {
    res = (
      <UrlToolTip
        placement="bottom"
        title={
          <a
            href={cell.attributes[CellAttribute.Link]}
            target="_blank"
            rel="noopener noreferrer"
          >
            {cell.attributes[CellAttribute.Link]}
          </a>
        }
        forceOpen={isMobile && isTheOnlyCellSelected}
      >
        {res}
      </UrlToolTip>
    );
  }
  if (cell.attributes?.[CellAttribute.Source]) {
    const source = JSON.parse(cell.attributes[CellAttribute.Source]);
    const unit = source.unit ? <p>{"unit:" + source.unit}</p> : null;
    const units = source.units ? (
      <table>
        <tbody>
          {(source.units as string[][]).map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    ) : null;
    res = (
      <UrlToolTip
        placement="right"
        title={
          <span style={{ color: "#202020", fontSize: 14 }}>
            Source:{" "}
            <a
              href={source.source}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "inherit", textDecoration: "none" }}
            >
              {(source.title || source.source) + " ↗️"}
            </a>
            {unit}
            {units}
          </span>
        }
        forceOpen={isMobile && isTheOnlyCellSelected}
        enterDelay={500}
      >
        {res}
      </UrlToolTip>
    );
  }
  if (cell.attributes?.[CellAttribute.Note]) {
    res = (
      <NoteToolTip placement="right" title={cell.attributes[CellAttribute.Note]} arrow>
        {res}
      </NoteToolTip>
    );
  }
  return res;
});

export const getColorCellStyles = (
  isEditingCurrentCell: boolean,
  isInSelection: boolean,
  isTheOnlyCellSelected: boolean,
  cellAttributes?: CellAttributes
): CSSProperties => {
  // SystemStyleObject type breaks here for some reason
  const styles: any = {};

  // we don't need to apply color and background color from cellAttributes
  // if cell is focused and being edited
  if (isEditingCurrentCell) {
    return {};
  }
  const color = cellAttributes?.[CellAttribute.Color];
  const bgColor = cellAttributes?.[CellAttribute.BgColor] || "#FFFFFF";
  if (color) {
    styles.color = color;
  }
  styles.backgroundColor = bgColor;
  if (!color) {
    try {
      if (getColorBrightness(bgColor) < 384) {
        styles.color = "#FFFFFF";
      }
    } catch (e) {
      // Swallow the error; Sending a bad value into the style causes no issues.
    }
  }
  return styles;
};

const getColorBrightness = (color: string): number =>
  parseInt(color.slice(1, 3), 16) +
  parseInt(color.slice(3, 5), 16) +
  parseInt(color.slice(5, 7), 16);

type BorderStyle = string | ((theme: Theme) => string);

interface BorderStyleRequest {
  active:
    | boolean
    | [
        boolean | undefined,
        boolean | undefined,
        boolean | undefined,
        boolean | undefined
      ];
  borderStyle: BorderStyle;
}

function getBorderSX(requests: BorderStyleRequest[]): CSSProperties {
  const sx: Record<string, BorderStyle> = {};

  for (const [idx, prop] of ["Top", "Right", "Bottom", "Left"].entries()) {
    for (const { active, borderStyle } of requests) {
      if (active === true || (Array.isArray(active) && active[idx])) {
        sx[`border${prop}`] = borderStyle;
        break;
      }
    }
  }

  return sx;
}

let default_style: CSSProperties;

function getCellStyle(
  style: CSSProperties,
  showAutofillDragControl: boolean,
  isFrozenColBound: boolean,
  isFrozenRowBound: boolean,
  isSearchHighlighted: boolean,
  isTheOnlyCellSelected: boolean,
  hasTopAutoFillBorder: boolean | undefined,
  hasRightAutoFillBorder: boolean | undefined,
  hasBottomAutoFillBorder: boolean | undefined,
  hasLeftAutoFillBorder: boolean | undefined,
  hasTopCutBorder: boolean | undefined,
  hasRightCutBorder: boolean | undefined,
  hasBottomCutBorder: boolean | undefined,
  hasLeftCutBorder: boolean | undefined,
  isSearchSelected: boolean,
  hasTopCopyFormatBorder: boolean | undefined,
  hasRightCopyFormatBorder: boolean | undefined,
  hasBottomCopyFormatBorder: boolean | undefined,
  hasLeftCopyFormatBorder: boolean | undefined,
  isEditingCurrentCell: boolean,
  inSelection: boolean,
  attributes: CellAttributes | undefined,
  lightBackground: string,
  highlightColorIdx: number | undefined
): CSSProperties {
  const allFalse = !(
    showAutofillDragControl ||
    isFrozenColBound ||
    isFrozenRowBound ||
    isSearchHighlighted ||
    isTheOnlyCellSelected ||
    hasTopAutoFillBorder ||
    hasRightAutoFillBorder ||
    hasBottomAutoFillBorder ||
    hasLeftAutoFillBorder ||
    hasTopCutBorder ||
    hasRightCutBorder ||
    hasBottomCutBorder ||
    hasLeftCutBorder ||
    isSearchSelected ||
    hasTopCopyFormatBorder ||
    hasRightCopyFormatBorder ||
    hasBottomCopyFormatBorder ||
    hasLeftCopyFormatBorder ||
    isEditingCurrentCell ||
    inSelection ||
    attributes ||
    highlightColorIdx !== undefined
  );

  if (allFalse && default_style) {
    return { ...default_style, ...style };
  }

  const styles: CSSProperties = { ...style };
  if (showAutofillDragControl) {
    styles.position = "relative";
    styles.zIndex = 1;
  }

  if (isSearchHighlighted) {
    styles.backgroundColor = lightBackground;
  }

  const dependentCellStyles: CSSProperties =
    highlightColorIdx !== undefined
      ? {
          outline: "1px dashed",
          outlineColor:
            dependsOnColors[highlightColorIdx % dependsOnColors.length].border,
          backgroundColor:
            dependsOnColors[highlightColorIdx % dependsOnColors.length].bg,
          zIndex: 1,
        }
      : {};

  const borderStyles = getBorderSX([
    {
      active: isSearchSelected,
      borderStyle: (theme) => `1px solid ${theme.palette.secondary.main} !important`,
    },
    {
      active: [
        hasTopCopyFormatBorder,
        hasRightCopyFormatBorder,
        hasBottomCopyFormatBorder,
        hasLeftCopyFormatBorder,
      ],
      borderStyle: getCutBorderStyle,
    },
    {
      active: [
        hasTopCutBorder,
        hasRightCutBorder,
        hasBottomCutBorder,
        hasLeftCutBorder,
      ],
      borderStyle: getCutBorderStyle,
    },
    {
      active: [
        hasTopAutoFillBorder,
        hasRightAutoFillBorder,
        hasBottomAutoFillBorder,
        hasLeftAutoFillBorder,
      ],
      borderStyle: AUTO_FILL_BORDER_STYLE,
    },
    {
      active: [false, isFrozenColBound, isFrozenRowBound, false],
      borderStyle: "4px solid rgb(219, 223, 231) !important",
    },
    { active: isTheOnlyCellSelected, borderStyle: ".5px solid rgba(0, 0, 0, .5)" },
  ]);

  const res = {
    ...styles,
    ...getColorCellStyles(
      isEditingCurrentCell,
      inSelection,
      isTheOnlyCellSelected,
      attributes
    ),
    ...dependentCellStyles,
    ...borderStyles,
    fontFamily: attributes?.[CellAttribute.Font] || ALLOWED_FONTS[0].cssName,
  };
  if (allFalse) {
    default_style = res;
  }
  return res;
}
