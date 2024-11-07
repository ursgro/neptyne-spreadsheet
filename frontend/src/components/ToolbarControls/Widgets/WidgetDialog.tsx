import React, { useCallback, useEffect } from "react";
import {
  Box,
  Button,
  Checkbox,
  DialogActions,
  Drawer,
  IconButton,
  Typography,
} from "@mui/material";
import { CellChangeWithRowCol } from "../../../neptyne-sheet/NeptyneSheet";
import {
  WidgetParamDefinition,
  WidgetParamType,
  WidgetRegistry,
} from "../../../NeptyneProtocol";
import { AutocompleteHandler } from "../../../notebook/NotebookCellEditor/types";
import { WidgetParamEditor } from "./WidgetParamEditor";
import { SheetSelection, toA1 } from "../../../SheetUtils";
import { WidgetListEditor } from "./WidgetListEditor";
import { WidgetNumberEditor } from "./WidgetNumberEditor";
import { WidgetEnumEditor } from "./WidgetEnumEditor";
import { WidgetColorPicker } from "./WidgetColorPicker";
import { WIDGET_ICONS } from "./widgetConstants";
import startCase from "lodash/startCase";
import { ReactComponent as CloseIcon } from "../../../icons/close.svg";
import { WidgetEditorLayout, WidgetEditorLayoutProps } from "./WidgetEditorLayout";
import isNil from "lodash/isNil";
import {
  ACTION_BUTTON_SX,
  CLOSE_BUTTON_SX,
  DRAWER_PAPER_SX,
  FORM_SX,
  getFormHeaderSX,
  getWidgetFormSX,
} from "./WidgetDialogStyle";
import tinykeys from "tinykeys";

export interface WidgetDialogProps {
  onUpdateCellValues: (updates: CellChangeWithRowCol[], fromPaste?: boolean) => void;
  widgetRegistry: WidgetRegistry;
  onClose: () => void;
  sheetSelection: SheetSelection;
  getAutocomplete: AutocompleteHandler;
  validateWidgetParams: (
    params: { [key: string]: string },
    code: string
  ) => Promise<{ [key: string]: string }>;
  onCreateFunctionSubmit: (newFunction: string) => void;
  // Marked optional due to NeptyneModals typing
  data?: { [key: string]: any };
  type?: string;
  widgetState?: { [key: string]: any };
}

const stringifyPythonicBoolean = (v: any) => {
  return !!v ? "True" : "False";
};

// Pass formulas without "=".
// Formulas can be used for Float, Int and String params.
const stringifyAcceptFormula = (v: string, wrapQuotes: boolean) => {
  if (v.startsWith("=")) {
    return v.substring(1);
  } else if (wrapQuotes) {
    return JSON.stringify(v);
  }
  return v;
};

const stringifyValue = (value: any, paramType: WidgetParamType) => {
  if (paramType === WidgetParamType.Boolean) {
    value = stringifyPythonicBoolean(value);
  } else if (paramType === WidgetParamType.Float || paramType === WidgetParamType.Int) {
    value = stringifyAcceptFormula(value.toString(), false);
  } else if (paramType === WidgetParamType.Enum) {
    value = JSON.stringify(value);
  } else if (
    paramType === WidgetParamType.String ||
    paramType === WidgetParamType.Color
  ) {
    value = !!value ? stringifyAcceptFormula(value, true) : "";
  } else {
    // Function or Other
    value = !!value ? value.toString() : "None";
  }
  return value;
};

interface WidgetCategories {
  categoryNameToParams: { [name: string]: WidgetParamDefinition[] };
  categoryOrder: string[];
}

const categorizeWidgetParams = (
  widgetParamDefinitions: WidgetParamDefinition[]
): WidgetCategories => {
  return widgetParamDefinitions.reduce(
    (
      rv: WidgetCategories,
      widgetParamDefinition: WidgetParamDefinition
    ): WidgetCategories => {
      const category = widgetParamDefinition.category
        ? widgetParamDefinition.category
        : "";
      if (rv.categoryNameToParams[category]) {
        rv.categoryNameToParams[category].push(widgetParamDefinition);
      } else {
        rv.categoryNameToParams[category] = [widgetParamDefinition];
        rv.categoryOrder.push(category);
      }
      return rv;
    },
    { categoryNameToParams: {}, categoryOrder: [] }
  );
};

export const WidgetDialog: React.FunctionComponent<WidgetDialogProps> = (props) => {
  const {
    type = "",
    data,
    onClose,
    onUpdateCellValues,
    widgetRegistry,
    widgetState = {},
    sheetSelection,
    getAutocomplete,
    validateWidgetParams,
    onCreateFunctionSubmit,
  } = props;
  const [newData, setNewData] = React.useState(data ?? {});
  const [paramErrors, setParamErrors] = React.useState({});

  // For tracking what to say in the save/submit buttons
  const [submitted, setSubmitted] = React.useState(false);

  const handleClose = useCallback(() => {
    setNewData((prevState: any) => {
      return {};
    });
    onClose();
  }, [onClose]);

  const onPreview = () => {
    sendCellValueUpdate();
  };

  const onSubmit = () => {
    sendCellValueUpdate(true);
  };

  const sendCellValueUpdate = (closeOnSuccess: boolean = false) => {
    const widgetTypeParams = widgetRegistry.widgets[type];
    let codeString = "=" + widgetTypeParams.name + "(";
    const paramNameToValue = new Map<string, string>();
    for (const param of widgetTypeParams.params) {
      let value = newData[param.name];
      if (value === null || value === undefined) {
        value = widgetState[param.name];
      }

      // Use default values for un-touched values
      if (value === undefined) {
        value = param.defaultValue;
      }
      const strValue = stringifyValue(value, param.type);

      // Skip unset optionals.
      if (param.optional) {
        const strDefault = stringifyValue(param.defaultValue, param.type);
        if (strValue === strDefault) continue;
      }

      paramNameToValue.set(param.name, strValue);
      codeString += param.name + "=" + strValue + ",";
    }
    if (codeString.endsWith(",")) {
      codeString = codeString.slice(0, -1);
    }
    codeString += ")";

    const change: CellChangeWithRowCol = {
      row: sheetSelection.start.row,
      col: sheetSelection.start.col,
      value: codeString,
    };
    validateWidgetParams(Object.fromEntries(paramNameToValue), codeString).then(
      (paramErrors) => {
        setParamErrors((prevParamErrors: { [key: string]: string }) => {
          return paramErrors;
        });
        if (Object.keys(paramErrors).length === 0) {
          // Only update the sheet cell if there are no param errors
          onUpdateCellValues([change]);
          setSubmitted(true);
          if (closeOnSuccess) {
            handleClose();
          }
        }
      }
    );
  };

  const renderWidget = (
    widgetTypeParamCategory: string,
    widgetTypeParam: WidgetParamDefinition
  ): JSX.Element => {
    const description = widgetTypeParam.description ?? "";
    const onChangeHandler = (newValue: any) => {
      setNewData((prevValues: any) => {
        prevValues[widgetTypeParam.name] = newValue;
        return { ...prevValues }; // Spread values into a new object to trigger re-render
      });
    };

    // Prioritize newData (from direct user input).
    // On first edit widgetState will be empty so load defaultValues.
    // On future edits, load from widgetState.
    const value: string = [
      newData[widgetTypeParam.name],
      widgetState[widgetTypeParam.name],
      widgetTypeParam.defaultValue,
      "",
    ].filter((value) => !isNil(value))[0];

    let extraLayoutProps: Partial<WidgetEditorLayoutProps> = {};
    let elem;
    if (widgetTypeParam.type === WidgetParamType.Enum && widgetTypeParam.enumValues) {
      elem = (
        <WidgetEnumEditor
          value={value.toString()}
          options={widgetTypeParam.enumValues}
          onChange={onChangeHandler}
        />
      );
    } else if (widgetTypeParam.type === WidgetParamType.Boolean) {
      extraLayoutProps = {
        isInputInline: true,
        withoutBorder: true,
      };
      elem = (
        <Checkbox
          sx={{
            padding: "0",
          }}
          color="secondary"
          checked={Boolean(value)}
          onChange={(ev, newValue) => {
            onChangeHandler(newValue);
          }}
        />
      );
    } else if (widgetTypeParam.type === WidgetParamType.List) {
      elem = <WidgetListEditor value={value.toString()} onChanges={onChangeHandler} />;
    } else if (widgetTypeParam.type === WidgetParamType.Color) {
      let strValue = "";
      if (value !== null && value !== undefined) {
        strValue = value.toString();
      }
      elem = <WidgetColorPicker value={strValue} onChanges={onChangeHandler} />;
    } else if (
      widgetTypeParam.type === WidgetParamType.Float ||
      widgetTypeParam.type === WidgetParamType.Int
    ) {
      elem = (
        <WidgetNumberEditor
          type={widgetTypeParam.type}
          value={value.toString()}
          onChange={onChangeHandler}
        />
      );
    } else {
      elem = (
        <WidgetParamEditor
          value={value.toString()}
          paramType={widgetTypeParam.type}
          getAutocomplete={getAutocomplete}
          onChanges={onChangeHandler}
          widgetType={type}
          cellName={toA1(sheetSelection.start.col, sheetSelection.start.row)}
          onCreateFunctionSubmit={onCreateFunctionSubmit}
        />
      );
    }

    return (
      <WidgetEditorLayout
        key={widgetTypeParam.type + ":" + widgetTypeParam.description}
        label={description}
        category={widgetTypeParamCategory}
        error={paramErrors[widgetTypeParam.name as keyof typeof paramErrors]}
        isInline={widgetTypeParam.inline}
        isRequired={!widgetTypeParam.optional}
        {...extraLayoutProps}
      >
        {elem}
      </WidgetEditorLayout>
    );
  };

  const renderWidgetForm = () => {
    const widgetTypeParams = widgetRegistry.widgets[type];
    const { categoryNameToParams, categoryOrder } = categorizeWidgetParams(
      widgetTypeParams.params
    );

    let errorMsg: JSX.Element = <></>;
    if (Object.keys(paramErrors).length > 0) {
      // @ts-ignore
      let errorString = paramErrors[""];
      errorString = errorString ?? "Invalid parameter(s)";
      errorMsg = (
        <Typography typography="body1" sx={{ color: "error.main" }}>
          {errorString}
        </Typography>
      );
    }
    return (
      <>
        {categoryOrder.flatMap((widgetTypeParamCategory) =>
          categoryNameToParams[widgetTypeParamCategory].map((widgetTypeParam) =>
            renderWidget(widgetTypeParamCategory, widgetTypeParam)
          )
        )}
        {errorMsg}
      </>
    );
  };

  useEffect(() => {
    const unsubscribe = tinykeys(window, {
      Escape: onClose,
    });
    return () => unsubscribe();
  }, [onClose]);

  if (widgetRegistry.widgets[type]) {
    const widgetIcon =
      WIDGET_ICONS[widgetRegistry.widgets[type].name as keyof typeof WIDGET_ICONS];

    return (
      <Drawer
        open
        anchor="right"
        onClose={handleClose}
        className="widget-drawer show-drawer"
        PaperProps={DRAWER_PAPER_SX}
        variant="persistent"
      >
        <Box sx={getWidgetFormSX}>
          <Box component="h3" sx={getFormHeaderSX}>
            {widgetIcon} {startCase(type)}
            <IconButton
              component={CloseIcon}
              sx={CLOSE_BUTTON_SX}
              onClick={handleClose}
            />
          </Box>
          <Box sx={FORM_SX}>{renderWidgetForm()}</Box>
          <DialogActions>
            <Button
              onClick={onPreview}
              variant="contained"
              color="primary"
              sx={ACTION_BUTTON_SX}
            >
              {submitted || Object.keys(widgetState).length ? "Save" : "Create"}
            </Button>
            <Button
              onClick={onSubmit}
              variant="contained"
              color="primary"
              sx={ACTION_BUTTON_SX}
            >
              {submitted || Object.keys(widgetState).length
                ? "Save and Close"
                : "Create and Close"}
            </Button>
          </DialogActions>
        </Box>
      </Drawer>
    );
  }
  return null;
};
