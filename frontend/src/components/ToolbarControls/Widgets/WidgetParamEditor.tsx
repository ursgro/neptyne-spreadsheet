import {
  ChangeEvent,
  FunctionComponent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { KeyBinding, placeholder } from "@codemirror/view";

import {
  BaseCodeEditor,
  BaseCodeEditorProps,
} from "../../../codemirror-editor/BaseCodeEditor/BaseCodeEditor";
import { Extension } from "@codemirror/state";
import { ReactComponent as ArrowRight } from "../../../icons/arrowRight.svg";
import { AutocompleteHandler } from "../../../notebook/NotebookCellEditor/types";
import { noop } from "../../../codemirror-editor/CodeMirror";
import { getPythonExtensions } from "../../../codemirror-editor/extensions/python";
import { WidgetParamType } from "../../../NeptyneProtocol";
import { conflictingHotKeys } from "../../../hotkeyConstants";
import {
  alpha,
  Box,
  Button,
  ButtonProps,
  darken,
  Icon,
  Popover,
  PopoverProps,
  Theme,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { SystemStyleObject } from "@mui/system";

const EDITOR_WRAPPER_SX = { position: "relative" };

const WRAPPER_SX = {
  position: "absolute",
  bottom: "-15px",
  right: "-15px",
};

const ADD_BUTTON_STATIC_PROPS: ButtonProps = {
  "aria-label": "create-function",
  color: "secondary",
  sx: {
    width: "30px",
    height: "30px",
    minWidth: "30px",
    borderRadius: "50%",
  },
  variant: "contained",
};

const POPOVER_STATIC_PROPS: Omit<PopoverProps, "open"> = {
  anchorOrigin: {
    vertical: "bottom",
    horizontal: "center",
  },
  transformOrigin: {
    vertical: "top",
    horizontal: "right",
  },
  sx: {
    marginTop: "10px",
    marginLeft: "20px",
  },
  PaperProps: {
    sx: (theme) => ({
      overflow: "visible",
      bgcolor: "common.white",
      boxShadow: `0 4px 4px 0 ${alpha(theme.palette.common.black, 0.1)}`,
      "&:before": {
        content: '""',
        display: "block",
        position: "absolute",
        top: 0,
        right: 14,
        width: 10,
        height: 10,
        bgcolor: "common.white",
        transform: "translateY(-50%) rotate(45deg)",
        zIndex: 0,
      },
      padding: "12px",
    }),
  },
};

const SUBMIT_BUTTON_STATIC_PROPS: ButtonProps = {
  variant: "contained",
  color: "secondary",
  sx: {
    borderRadius: "50px",
    float: "right",
    height: "25px",
    padding: 0,
    width: "70px",
    marginTop: "5px",
  },
};

const ADD_ICON_SX = { color: "common.white" };

const ARROW_ICON_SX = { width: 10 };

export const getWidgetInputSX = (theme: Theme): SystemStyleObject<Theme> => ({
  ...theme.typography.input,
  backgroundColor: alpha(darken(theme.palette.secondary.main, 0.2), 0.2),
  border: "0",
  borderRadius: "3px",
  color: theme.palette.text.primary,
  margin: "0",
  outline: 0,
  padding: "8px",
  transitionDuration: theme.transitions.duration.standard + "ms",
  transitionProperty: "background-color",
  transitionTimingFunction: theme.transitions.easing.easeOut,
  width: "100%",
  "::placeholder, .cm-placeholder": {
    color: theme.palette.grey[400],
  },
  ":hover, :focus, :focus-within": {
    backgroundColor: alpha(theme.palette.secondary.main, 0.11),
  },
  // CodeMirror patches
  ".cm-editor, .cm-content, .cm-scroller": {
    height: theme.typography.input.lineHeight,
  },
  ".cm-scroller": {
    lineHeight: theme.typography.input.lineHeight,
  },
  ".cm-content": {
    padding: 0,
  },
});

const CODEMIRROR_WIDGET_INPUT_PROPS = {
  sx: getWidgetInputSX,
};

const HEADER_SX = (theme: Theme) => theme.typography.tooltipTitle;

interface WidgetFunctionEditorProps extends BaseCodeEditorProps {
  paramType: WidgetParamType;
  getAutocomplete?: AutocompleteHandler;
  onSpecialKey?: (specialKey: string) => void;
  widgetType: string;
  cellName: string;
  onCreateFunctionSubmit?: (newFunction: string) => void;
}

const getFunctionEditorExtensions = (
  getAutocomplete: AutocompleteHandler | undefined
): Extension[] => {
  return [
    ...getPythonExtensions(getAutocomplete, {
      functionsOnly: true,
      useSpreadsheetFunctions: true,
    }),
    placeholder("Choose function"),
  ];
};

/**
 * Editor for widget creation parameters.
 *
 * Support behaviors based on input type (such as autocomplete on functions).
 */
export const WidgetParamEditor: FunctionComponent<WidgetFunctionEditorProps> = ({
  paramType,
  getAutocomplete,
  onSpecialKey = noop,
  onCreateFunctionSubmit = noop,
  widgetType,
  cellName,
  ...props
}) => {
  const paramEditorExtensions = useMemo(
    () =>
      paramType === WidgetParamType.Function
        ? getFunctionEditorExtensions(getAutocomplete)
        : [],
    [paramType, getAutocomplete]
  );

  const keyBindings: KeyBinding[] = useMemo(
    () => [
      {
        key: "Enter",
        preventDefault: true,
        run: (view) => false,
      },
      {
        key: "Escape",
        preventDefault: true,
        run: (view) => false,
      },
    ],
    []
  );

  const onChanges = props.onChanges;

  const handleSubmit = useCallback(
    (newValue: string) => {
      onChanges?.(newValue, false);
      onCreateFunctionSubmit(newValue);
    },
    [onChanges, onCreateFunctionSubmit]
  );

  return (
    <Box sx={EDITOR_WRAPPER_SX}>
      <Box onClick={handlePreventClickPropagation}>
        <BaseCodeEditor
          onChanges={onChanges}
          extensions={paramEditorExtensions}
          extraKeyBindings={keyBindings}
          mutedHotKeys={conflictingHotKeys}
          elementProps={CODEMIRROR_WIDGET_INPUT_PROPS}
          {...props}
        />
      </Box>
      {paramType === WidgetParamType.Function && (
        <CreateFunctionView
          cellName={cellName}
          widgetType={widgetType}
          onSubmit={handleSubmit}
        />
      )}
    </Box>
  );
};

interface CreateFunctionViewProps {
  cellName: string;
  widgetType: string;
  onSubmit: (newFunctionName: string) => void;
}

const CreateFunctionView: FunctionComponent<CreateFunctionViewProps> = ({
  cellName,
  widgetType,
  onSubmit,
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

  const handleToggle = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) =>
      setAnchorEl((prev) => (!prev ? event.currentTarget : null)),
    []
  );

  const handleClose = useCallback(() => setAnchorEl(null), []);

  const isOpen = !!anchorEl;
  const id = isOpen ? "create-function-tooltip" : undefined;

  const [functionName, setFunctionName] = useState(
    `handle_${widgetType.toLowerCase()}_${cellName}`
  );

  useEffect(
    () => setFunctionName(`handle_${widgetType.toLowerCase()}_${cellName}`),
    [widgetType, cellName]
  );

  const handleSubmit = useCallback(() => {
    handleClose();
    onSubmit(functionName);
  }, [functionName, handleClose, onSubmit]);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setFunctionName(e.target.value),
    []
  );

  return (
    <Box sx={WRAPPER_SX}>
      <Tooltip title="New">
        <Button
          aria-describedby={id}
          onClick={handleToggle}
          {...ADD_BUTTON_STATIC_PROPS}
        >
          <Icon sx={ADD_ICON_SX} component={AddIcon} />
        </Button>
      </Tooltip>
      <Popover
        id={id}
        open={isOpen}
        anchorEl={anchorEl}
        onClose={handleClose}
        {...POPOVER_STATIC_PROPS}
      >
        <Typography sx={HEADER_SX}>Function name</Typography>
        <Box
          component="input"
          type="text"
          placeholder="Create function"
          sx={getWidgetInputSX}
          value={functionName}
          onChange={handleChange}
        />
        <br />
        <Button {...SUBMIT_BUTTON_STATIC_PROPS} onClick={handleSubmit}>
          <Icon component={ArrowRight} sx={ARROW_ICON_SX} />
          <Icon component={ArrowRight} sx={ARROW_ICON_SX} />
        </Button>
      </Popover>
    </Box>
  );
};

const handlePreventClickPropagation: React.MouseEventHandler = (e) => {
  e.stopPropagation();
  e.preventDefault();
};
