import ReactDataSheet from "./react-datasheet";
import _ from "lodash";
import { Md5 } from "ts-md5/dist/md5";
import React, { SyntheticEvent, useCallback, useEffect, useRef, useState } from "react";
import { isValid, parse } from "date-fns";
import LinkOffIcon from "@mui/icons-material/LinkOff";

import {
  CellAttributes,
  formatNumber,
  GridElement,
  isPercentageValue,
  percentageToNumber,
  quickEvalExpression,
  isCurrencyValue,
  currencyToNumber,
  isFormulaValue,
} from "./SheetUtils";
import { Output } from "./Notebook";
import Convert from "ansi-to-html";
import {
  Box,
  SvgIcon,
  Theme,
  Tooltip,
  TooltipProps,
  tooltipClasses,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import { CellAttribute, MimeTypes, NumberFormat } from "./NeptyneProtocol";
import { ReactComponent as Logo } from "./logo.svg";
import { ReactComponent as LogoGray } from "./logoGray.svg";
import { ValueViewer } from "./react-datasheet/index";
import { DATE_FORMATS, TIME_FORMATS } from "./datetimeConstants";
import { jsDateToExcelDate, MIN_EXCEL_DATE } from "./excelDates";
import { SystemStyleObject } from "@mui/system";
import { WidgetResizer } from "./WidgetResize";
import { fontFamily } from "./theme";

const DEFAULT_WIDGET_WIDTH = 800;
const DEFAULT_WIDGET_HEIGHT = 600;

const IFRAME_SRC = `<!DOCTYPE html>
<meta charset="UTF-8">
<script>
window.addEventListener("message", function(event) {
  if (event.data.eval_src) {
    eval.call(null, event.data.eval_src);
  }
}, false);
</script>`;

const DefaultHTMLStyles = `
<style>
html {
    font-family: sans-serif;
}
body {
    margin: 0;
}
table {
    border: none;
    border-collapse: collapse;
    border-spacing: 0;
    color: black;
    font-size: 14px;
    table-layout: fixed;
}
thead {
    border-bottom: 1px solid black;
    vertical-align: bottom;
}
tr, th, td {
    text-align: right;
    vertical-align: middle;
    padding: 0.5em 0.5em;
    line-height: normal;
    white-space: normal;
    max-width: none;
    border: none;
}
th {
    font-weight: bold;
}
tbody tr:nth-child(odd) {
    background: #f5f5f5;
}
tbody tr:hover {
    background: rgba(66, 165, 245, 0.2);
}
</style>
`;

export enum ConnectionState {
  Connecting = 0,
  Connected = 1,
  Working = 2,
  Disconnected = 3,
  Initializing = 4,
  InstallingRequirements = 5,
  LoadingValues = 6,
  NoTyne = 7,
}

export const isNumberValue = (value: string | number | null): boolean =>
  typeof value === "number";

export const getDateFormat = (value: string | number | null): string | null => {
  const dateFormats = [...DATE_FORMATS, ...TIME_FORMATS];
  let parsedFormat = null;

  if (value && typeof value === "string") {
    for (let i = 0; i < dateFormats.length; i++) {
      const parsedDate = parse(value, dateFormats[i], new Date());

      if (isValid(parsedDate)) {
        parsedFormat = dateFormats[i];
        break;
      }
    }
  }

  return parsedFormat;
};

export const getCellOriginalValue = (value: string | number | null): string => {
  if (!value && value !== 0) {
    return "";
  }

  let returnValue: string | number = value;

  const parsedFormat = getDateFormat(value);
  const [isPercentage] = isPercentageValue(value);
  const [isCurrency] = isCurrencyValue(value);
  const isFormula = isFormulaValue(value.toString());

  if (!parsedFormat && !isPercentage && !isCurrency && !isFormula) {
    return value.toString();
  }

  if (!!parsedFormat) {
    let jsDate = new Date(value);
    if (TIME_FORMATS.includes(parsedFormat)) {
      jsDate = parse(value.toString(), parsedFormat, MIN_EXCEL_DATE);
    }
    returnValue = jsDateToExcelDate(jsDate);
  } else if (isPercentage) {
    returnValue = percentageToNumber(value.toString());
  } else if (isCurrency) {
    returnValue = currencyToNumber(value.toString());
  } else if (isFormula) {
    returnValue = withMatchedBrackets(returnValue.toString());
  }

  return returnValue.toString();
};

export const withMatchedBrackets = (value: string): string => {
  let bracketsStack: string[] = [];
  let stringStart: string | null = null;
  let wasBackslash = false;

  for (let ch of value) {
    if (wasBackslash) {
      wasBackslash = false;
      continue;
    }

    if (ch === "\\") {
      wasBackslash = true;
    } else if (stringStart !== null) {
      if (ch === stringStart) {
        stringStart = null;
      }
    } else {
      switch (ch) {
        case '"':
        case "'":
          stringStart = ch;
          break;
        case "(":
          bracketsStack.push(")");
          break;
        case "[":
          bracketsStack.push("]");
          break;
        case ")":
        case "]":
          if (
            bracketsStack.length > 0 &&
            bracketsStack[bracketsStack.length - 1] === ch
          ) {
            bracketsStack.pop();
          }
          break;
      }
    }
  }

  let output = value;

  if (stringStart !== null) {
    output += stringStart;
  }

  while (bracketsStack.length > 0) {
    output += bracketsStack.pop();
  }

  return output;
};

export function asString(exp: any) {
  if (typeof exp === "string") {
    return exp;
  } else if (Array.isArray(exp)) {
    return exp.join("");
  } else {
    return JSON.stringify(exp);
  }
}

export function outputToData(outputs?: Output[] | string | number): {
  [k: string]: string | number;
} {
  if (outputs !== undefined && typeof outputs !== "object") {
    return { "application/json": outputs };
  }
  if (!outputs || outputs.length === 0) {
    return { "text/plain": "" };
  }

  const priority = {
    error: 4,
    display_data: 3,
    stream: 2,
    execute_result: 1,
  };

  const output = outputs.reduce(function (prev, current) {
    return priority[prev.output_type] > priority[current.output_type] ? prev : current;
  });

  const maybeJoin = (data: {
    [k: string]: string | string[];
  }): { [k: string]: string } => {
    return Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? v.join("") : v])
    );
  };

  switch (output.output_type) {
    case "error":
      return { error: JSON.stringify(output) };
    case "display_data":
      return maybeJoin(output.data);
    case "stream":
      return {
        "text/plain": Array.isArray(output.text) ? output.text.join("") : output.text,
      };
    case "execute_result":
      return maybeJoin(output.data);
    default:
      return { "text/plain": "INTERNAL ERROR" };
  }
}

interface MimeBundle {
  [mimeType: string]: string | number;
}

interface RenderMetadata {
  __neptyne_meta__?: {
    inline: boolean;
  };
}

type NeptyneMimeBundle = MimeBundle & RenderMetadata;

enum TextPreviewFormat {
  ERROR = "error",
  NUMBER = "number",
  PLAINTEXT = "plaintext",
}

export function renderDisplayData(data: NeptyneMimeBundle | null) {
  let viewer = undefined;
  let res: any;
  let addedCellAttributes: CellAttributes = {};
  let addedCellFields: Partial<GridElement> = {};
  if (data?.__neptyne_meta__?.inline) {
    addedCellFields.renderInline = true;
  }
  if (data === null) {
    res = "";
  } else if (data["image/png"]) {
    res = "data:image/png;base64," + asString(data["image/png"]);
    viewer = ImageViewer;
    addedCellFields.hasOverlappingWidget = !addedCellFields.renderInline;
  } else if (data["image/svg+xml"]) {
    try {
      const base64data = btoa(asString(data["image/svg+xml"]));
      res = "data:image/svg+xml;base64," + base64data;
      viewer = ImageViewer;
      addedCellFields.hasOverlappingWidget = !addedCellFields.renderInline;
    } catch (e) {
      res = JSON.stringify({ ename: "Invalid SVG" });
      viewer = ErrorViewer;
    }
  } else if (data[MimeTypes.NeptyneError]) {
    res = JSON.stringify(data[MimeTypes.NeptyneError]);
    viewer = ErrorViewer;
  } else if (data[MimeTypes.NeptyneWidget]) {
    addedCellAttributes[CellAttribute.Widget] = JSON.stringify(
      data[MimeTypes.NeptyneWidget]
    );
  } else if (data["text/html"]) {
    res = data["text/html"];
    viewer = HtmlViewer;
    addedCellFields.hasOverlappingWidget = !addedCellFields.renderInline;
  } else if (data["error"]) {
    res = data["error"];
    viewer = ErrorViewer;
  } else if (
    data["application/number"] !== undefined ||
    data["application/decimal"] !== undefined
  ) {
    res = data["application/number"] || data["application/decimal"];
    return { viewer: NumberViewer, value: Number(res) };
  } else if (data["application/json"] !== undefined) {
    res = data["application/json"];
    if (res === null) {
      res = "";
    } else if (isNumberValue(res)) {
      return { viewer: NumberViewer, value: res };
    }
  } else if (data["text/plain"]) {
    res = data["text/plain"];
    const flattened = asString(res);
    const asNumber = Number(flattened);
    if (!Number.isNaN(asNumber)) {
      return { viewer: NumberViewer, value: asNumber };
    }
  } else if (data["application/aiviewer"]) {
    res = data["application/aiviewer"];
    viewer = AIResponseViewer;
  } else {
    res = "";
  }

  let value: string = asString(res);

  return { viewer, value, addedCellAttributes, addedCellFields };
}

export const getTextPreviewFormat = (
  data: NeptyneMimeBundle | null
): TextPreviewFormat | undefined => {
  let textPreviewFormat: TextPreviewFormat | undefined;

  if (data === null) {
    return;
  }

  let res: any;
  if (data["image/svg+xml"]) {
    try {
      btoa(asString(data["image/svg+xml"]));
    } catch (e) {
      textPreviewFormat = TextPreviewFormat.ERROR;
    }
  } else if (data[MimeTypes.NeptyneError]) {
    textPreviewFormat = TextPreviewFormat.ERROR;
  } else if (data["error"]) {
    textPreviewFormat = TextPreviewFormat.ERROR;
  } else if (data["application/json"] !== undefined) {
    res = data["application/json"];
    if (isNumberValue(res)) {
      textPreviewFormat = TextPreviewFormat.NUMBER;
    }
  } else if (data["text/plain"]) {
    res = data["text/plain"];
    const flattened = asString(res);
    const asNumber = Number(flattened);
    if (!Number.isNaN(asNumber)) {
      textPreviewFormat = TextPreviewFormat.NUMBER;
    }
  } else if (data["application/aiviewer"]) {
    textPreviewFormat = TextPreviewFormat.PLAINTEXT;
  }
  return textPreviewFormat;
};

export const getTextPreview = (
  data: NeptyneMimeBundle | null,
  cell: GridElement
): string => {
  const format: TextPreviewFormat | undefined = getTextPreviewFormat(data);
  if (!format && !cell.value) {
    return "";
  }
  if (format === TextPreviewFormat.ERROR) {
    return JSON.parse(cell.value + "").ename;
  }
  if (format === TextPreviewFormat.NUMBER) {
    return getRenderedNumber(cell) || "";
  }
  return cell.value?.toString() || "";
};

const truncate = (str: string, limit: number): string => {
  if (str.length <= limit) {
    return str;
  }

  return `${str.slice(0, limit - 3)}...`;
};

export const Traceback = ({ traceback }: { traceback: string[] }) => {
  if (
    traceback.length > 0 &&
    traceback[0].indexOf(
      "----------------------------------------------------------------"
    ) !== -1
  ) {
    traceback = traceback.slice(1);
  }
  const convert = new Convert({ newline: true, fg: "black", escapeXML: true });
  try {
    const html = _(traceback)
      .flatMap((l) => l.split("\n"))
      .map((l) => truncate(l, 200))
      .map((l) => convert.toHtml(l))
      .join("\n");
    return (
      <pre
        dangerouslySetInnerHTML={{ __html: html }}
        style={{ whiteSpace: "pre-wrap" }}
      />
    );
  } catch (e) {
    return <pre style={{ whiteSpace: "pre-wrap" }}>{traceback.join("\n")}</pre>;
  }
};

export function applyViewer(
  value: string | number,
  Viewer?: React.ComponentType<ReactDataSheet.ValueViewerProps<GridElement, string>>
) {
  if (!Viewer) {
    return (
      <span>
        <pre style={{ whiteSpace: "pre-wrap" }}>{value}</pre>
      </span>
    );
  } else {
    return (
      <Viewer
        cell={{ value: value, expression: "" + value }}
        col={-1}
        row={-1}
        value={value}
        isReadOnly={true}
      />
    );
  }
}

const MAYBE_FLOAT_WRAPPER_STYLE: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
};

const MAYBE_FLOAT_BOX_SX = (theme: Theme) => ({
  position: "absolute",
  zIndex: theme.zIndex.gridPopover,
});

interface MaybeFloatProps extends ReactDataSheet.ValueViewerProps<GridElement> {
  style?: React.CSSProperties;
  contentWidth?: number;
  contentHeight?: number;
  children?: React.ReactNode;
}

const noop = () => {};

const MaybeFloat: React.FC<MaybeFloatProps> = ({
  cell,
  col,
  row,
  children,
  isCurrentCell,
  style,
  contentWidth,
  contentHeight,
  isReadOnly,
  onWidgetResize = noop,
}) => {
  if (cell.renderInline || (col === -1 && row === -1)) {
    return <>{children}</>;
  }
  return (
    <div style={MAYBE_FLOAT_WRAPPER_STYLE}>
      {!isReadOnly && isCurrentCell && contentWidth && contentHeight && (
        <WidgetResizer
          contentHeight={contentHeight}
          contentWidth={contentWidth}
          onResizeCommit={onWidgetResize}
        />
      )}
      <Box sx={[MAYBE_FLOAT_BOX_SX, style as SystemStyleObject]}>{children}</Box>
    </div>
  );
};

const VIEWER_WRAPPER_STYLE: React.CSSProperties = {
  width: "100%",
  height: "100%",
  position: "absolute",
  top: 0,
  left: -4,
};

const IMAGE_VIEWER_IMG_STYLE: React.CSSProperties = {
  maxWidth: 1024,
  maxHeight: 1024,
  left: 0,
  top: 0,
  backgroundColor: "white",
};

const ImageViewer = (props: ReactDataSheet.ValueViewerProps<GridElement>) => {
  const { value, onWidgetResize, onSelectCell = noop } = props;
  const { width, height } = viewerPropsToWidthHeight(props);
  const [contentWidth, setContentWidth] = useState(width);
  const [contentHeight, setContentHeight] = useState(height);
  const renderInline = props.cell.renderInline;

  const handleResize = useCallback(
    (x?: number, y?: number) => {
      if (contentWidth && contentHeight) {
        x && setContentWidth(x);
        y && setContentHeight(y);
        onWidgetResize?.(x ?? contentWidth, y ?? contentHeight);
      }
    },
    [contentWidth, contentHeight, onWidgetResize]
  );

  if (value) {
    return (
      <MaybeFloat
        style={VIEWER_WRAPPER_STYLE}
        contentHeight={contentHeight}
        contentWidth={contentWidth}
        onWidgetResize={handleResize}
        {...props}
      >
        <img
          className="neptyne-user-image"
          src={"" + value}
          alt=""
          style={renderInline ? { objectFit: "contain" } : IMAGE_VIEWER_IMG_STYLE}
          width={renderInline ? "100%" : contentWidth}
          height={renderInline ? "100%" : contentHeight}
          onClick={onSelectCell}
        />
      </MaybeFloat>
    );
  }
  return <div>Error</div>;
};

const viewerPropsToWidthHeight = (
  props: ReactDataSheet.ValueViewerProps<GridElement, string>
) => {
  const { cell } = props;
  let width, height;
  if (cell && cell.attributes) {
    if (cell.attributes[CellAttribute.RenderWidth]) {
      width = Number(cell.attributes[CellAttribute.RenderWidth]);
    }
    if (cell.attributes[CellAttribute.RenderHeight]) {
      height = Number(cell.attributes[CellAttribute.RenderHeight]);
    }
  }
  return { width, height };
};

const isAnchorElement = (element: Element): element is HTMLAnchorElement =>
  element.nodeName === "A";

const queryStringToObject = (queryString: string): Record<string, string> =>
  queryString
    .split("&")
    .map((pair) => pair.split("="))
    .reduce((acc, [key, value]) => ({ [key]: value, ...acc }), {});

const objectToQueryString = (obj: Record<string, string>): string =>
  Object.entries(obj)
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

/**
 * Adapts links in <a /> elements for iframe.
 *
 * If the link is absolute, we have to enfore target="_blank". Otherwise it will open link inside
 * an iframe, and we want links to be opened in a new tab.
 *
 * If the link is relative (#key=value), we have to parse it and merge with other attributes.
 */
const linkAdjustedElement = (element: Element) => {
  if (isAnchorElement(element)) {
    const href = element.attributes.getNamedItem("href")?.value || "";
    const isAbsoluteLink = !href.startsWith("#");

    if (isAbsoluteLink) {
      element.target = "_blank";
    } else {
      element.target = "_parent";

      const hashStart = window.location.href.lastIndexOf("#");

      element.href =
        hashStart > -1
          ? `${window.location.href.substring(0, hashStart)}#${objectToQueryString({
              ...queryStringToObject(window.location.href.substring(hashStart + 1)),
              ...queryStringToObject(href.substring(1)),
            })}`
          : window.location.href + href;
    }
  }

  [...element.children].forEach((child) => linkAdjustedElement(child));
};

const linkAdjustedValue = (value: string): string => {
  var element = document.createElement("div");
  element.innerHTML = value;

  linkAdjustedElement(element);

  return element.outerHTML;
};

const HtmlViewer = (props: ReactDataSheet.ValueViewerProps<GridElement, string>) => {
  const { onWidgetResize, onSelectCell } = props;
  const value = linkAdjustedValue(props.value as string);
  const { width, height } = viewerPropsToWidthHeight(props);
  const [contentWidth, setContentWidth] = useState(width ?? DEFAULT_WIDGET_WIDTH);
  const [contentHeight, setContentHeight] = useState(height ?? DEFAULT_WIDGET_HEIGHT);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // We need to use a ref to access the up-to-date value of this in the initialization callback
  // for the iframe component
  const sourceRef = useRef<string>();
  sourceRef.current = value + "";

  const sourceHash = Md5.hashStr(value + "");
  const [, setInitializedWithSource] = useState("");

  const handleLoaded = useCallback((event: SyntheticEvent<HTMLIFrameElement>) => {
    const source = sourceRef.current;
    const sourceHash = Md5.hashStr(source!);
    setInitializedWithSource((hash) => {
      if (hash === sourceHash) {
        return hash;
      }
      const message = {
        eval_src: `(function() {var preserve = document.getElementsByTagName("script")[0].outerHTML; document.open(); document.write(preserve); document.write(${JSON.stringify(
          DefaultHTMLStyles
        )}); document.write(${JSON.stringify(source)}); document.close();})()`,
      };
      iframeRef.current?.contentWindow?.postMessage(message, "*");
      return sourceHash;
    });
  }, []);

  const handleResize = useCallback(
    (x?: number, y?: number) => {
      x && setContentWidth(x);
      y && setContentHeight(y);
      onWidgetResize?.(x ?? contentWidth, y ?? contentHeight);
    },
    [contentWidth, contentHeight, onWidgetResize]
  );

  useEffect(() => {
    const onBlur = () => {
      if (
        onSelectCell &&
        document.activeElement &&
        document.activeElement.nodeName.toLowerCase() === "iframe" &&
        (document.activeElement as HTMLIFrameElement).title === sourceHash
      ) {
        // infer a mouse down event on the iframe - also call mouse up to clear the selection
        onSelectCell();
      }
    };

    window.addEventListener("blur", onBlur);

    return () => {
      window.removeEventListener("blur", onBlur);
    };
  }, [onSelectCell, sourceHash]);

  if (value) {
    const { row, col } = props;
    const floating = row !== -1 && col !== -1;
    let styles;
    if (props.cell.renderInline) {
      styles = { height: "100%", width: "100%" };
    } else if (floating) {
      styles = {
        maxHeight: contentHeight,
        minHeight: contentHeight,
        maxWidth: contentWidth,
        minWidth: contentWidth,
      };
    } else {
      styles = {
        width: "100%",
      };
    }
    return (
      <MaybeFloat
        style={VIEWER_WRAPPER_STYLE}
        {...props}
        contentHeight={contentHeight}
        contentWidth={contentWidth}
        onWidgetResize={handleResize}
      >
        <iframe
          title={sourceHash}
          ref={iframeRef}
          onLoad={handleLoaded}
          src={`data:text/html;charset=utf-8,${IFRAME_SRC}<!--${sourceHash}-->`}
          sandbox="allow-scripts"
          style={{
            border: 0,
            padding: 0,
            margin: 0,
            backgroundColor: "white",
            ...styles,
          }}
          data-testid={`widget-${props.row}-${props.col}`}
        />
      </MaybeFloat>
    );
  }
  return <div>Error</div>;
};

export const formatAndSubformatFromCellAttribute = (
  attributeName: string,
  cellAttributes?: CellAttributes
): [NumberFormat?, string?] => {
  if (cellAttributes && cellAttributes[attributeName]) {
    const attribute = cellAttributes[attributeName];
    const dashIndex = attribute.indexOf("-");
    if (dashIndex !== -1) {
      return [
        attribute.substring(0, dashIndex) as NumberFormat,
        attribute.substring(dashIndex + 1),
      ];
    }
    return [attribute as NumberFormat, undefined];
  }
  return [undefined, undefined];
};

const getRenderedNumber = (cell: GridElement): string | null => {
  if (cell.value !== null) {
    let rendered = "" + cell.value;
    if (isNumberValue(cell.value)) {
      const value = cell.value as number;
      const [numberFormat, subformat] = formatAndSubformatFromCellAttribute(
        CellAttribute.NumberFormat,
        cell.attributes
      );
      rendered = formatNumber(value, numberFormat, subformat);
    }
    return rendered;
  }
  return null;
};

const NumberViewer = (props: ReactDataSheet.ValueViewerProps<GridElement, string>) => {
  const { cell, ...rest } = props;
  const rendered = getRenderedNumber(cell);
  if (rendered !== null) {
    return <ValueViewer {...rest} cell={cell} value={rendered} />;
  }
  return <div>Error</div>;
};

const AIResponseViewer = (
  props: ReactDataSheet.ValueViewerProps<GridElement, string>
) => {
  const { cell } = props;
  return (
    <div
      style={{
        fontFamily: fontFamily,
        margin: 2,
        padding: 2,
        borderRadius: 4,
        backgroundColor: "#26bfad20",
      }}
    >
      {cell.value}
    </div>
  );
};

export const ErrorToolTip = styled(({ className, ...props }: TooltipProps) => (
  <Tooltip {...props} classes={{ popper: className }} />
))(({ theme }) => ({
  [`& .${tooltipClasses.tooltip}`]: {
    margin: 0,
    fontSize: 14,
    maxWidth: 720,
    backgroundColor: "#E0E0E0",
    color: "black",
  },
}));

const ErrorViewer = (props: ReactDataSheet.ValueViewerProps<GridElement, string>) => {
  const { value } = props;
  if (value) {
    const unpacked = JSON.parse(value + "");
    let res = <div style={{ color: "red" }}>{unpacked.ename}</div>;
    if (unpacked.traceback || unpacked.msg) {
      let title = unpacked.msg || "";
      if (unpacked.traceback) {
        title = <h4>{title}</h4>;
        title = (
          <>
            {title}
            <Traceback traceback={unpacked.traceback} />
          </>
        );
      }
      res = (
        <ErrorToolTip placement="right" title={title}>
          {res}
        </ErrorToolTip>
      );
    }
    return res;
  }
  return <div>Error</div>;
};

const DISCONNECTED_ICON = <LinkOffIcon fontSize="large" />;
const ANIMATED_IMAGE = (
  <img src={"/img/animate_logo.gif"} width={18} height={18} alt="Animated Logo" />
);
export const LOGO_ICON = (
  <SvgIcon data-testid="LogoIcon">
    <Logo />
  </SvgIcon>
);

export const LOGO_ICON_GRAY = (
  <SvgIcon data-testid="LogoIconEmptyState">
    <LogoGray />
  </SvgIcon>
);

export function statusToIcon(state: ConnectionState, initialized: boolean) {
  switch (state) {
    case ConnectionState.Connecting:
      return ANIMATED_IMAGE;
    case ConnectionState.Connected:
      return initialized ? LOGO_ICON : ANIMATED_IMAGE;
    case ConnectionState.NoTyne:
      return LOGO_ICON_GRAY;
    case ConnectionState.Working:
    case ConnectionState.Initializing:
    case ConnectionState.InstallingRequirements:
    case ConnectionState.LoadingValues:
      return ANIMATED_IMAGE;
    case ConnectionState.Disconnected:
      return DISCONNECTED_ICON;
    default:
      return <span>???</span>;
  }
}

export function statusToText(
  state: ConnectionState,
  initialized: boolean
): string | null {
  switch (state) {
    case ConnectionState.Connecting:
      return "Connecting...";
    case ConnectionState.Initializing:
      return "Initializing...";
    case ConnectionState.InstallingRequirements:
      return "Installing packages...";
    case ConnectionState.LoadingValues:
      return "Loading sheets...";
    default:
      return initialized ? null : "Initializing...";
  }
}

export const getCellFormattedValue = (
  value: string | number | null,
  expression?: string | null,
  attributes?: CellAttributes,
  isEvalValue?: boolean
): string => {
  if (typeof expression !== "string" || !expression.length) {
    return "";
  }

  // for widgets value will be empty, so we need to check them separately
  if (attributes?.[CellAttribute.Widget]) {
    return expression;
  }

  const returnValue = toCodemirrorValue(value);

  if (isFormulaValue(expression)) {
    return isEvalValue ? quickEvalExpression(expression) : expression;
  }

  if (!attributes) {
    return returnValue;
  }

  return getCellNumberFormattedValue(returnValue, attributes);
};

export const getCellNumberFormattedValue = (
  value: string,
  attributes: CellAttributes
): string => {
  if (/^\s*$/.test(value)) {
    // whitespace-only value
    return value;
  }
  const numberValue: number = Number(value);
  if (Number.isNaN(numberValue)) {
    return value;
  }
  const [numberFormat, subformat] = formatAndSubformatFromCellAttribute(
    CellAttribute.NumberFormat,
    attributes
  );
  return formatNumber(numberValue, numberFormat, subformat, true);
};

export const toCodemirrorValue = (value: string | number | null): string => {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return value.toString();
  }
  return "";
};

export const renderData = (cell: GridElement) => cell.expression;

export const renderValue = (cell: GridElement) => cell.value;
