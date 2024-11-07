import React, { FunctionComponent, useCallback } from "react";
import { Box, Theme } from "@mui/material";
import { getWidgetInputSX } from "./WidgetParamEditor";
import { WidgetParamType } from "../../../NeptyneProtocol";
import { SystemStyleObject } from "@mui/system";

interface WidgetNumberEditorProps {
  onChange: (value: string) => void;
  value: string;
  type: WidgetParamType.Int | WidgetParamType.Float;
}

const FLOAT_SEPARATOR = Intl.NumberFormat().format(0.1)[1];

const getNumberInputSX = (theme: Theme): SystemStyleObject<Theme> => ({
  ...getWidgetInputSX(theme),
  appearance: "textfield",
  "::-webkit-inner-spin-button": {
    appearance: "none",
    margin: 0,
  },
});

export const WidgetNumberEditor: FunctionComponent<WidgetNumberEditorProps> = ({
  type,
  value,
  onChange,
}) => {
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      const eventTarget = event.target as HTMLInputElement;
      if (
        event.key === FLOAT_SEPARATOR
          ? type !== WidgetParamType.Float ||
            // input[type=number] always store float separator as .
            eventTarget.value.includes(".")
          : // Only check keys with value keys, since key stores special keys as words.
            event.key.length === 1 &&
            // Only allow numeric keys
            !event.code.startsWith("Digit")
      )
        event.preventDefault();
    },
    [type]
  );
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange(
        type === WidgetParamType.Float && event.target.value.startsWith(".")
          ? "0" + event.target.value
          : event.target.value
      );
    },
    [onChange, type]
  );

  return (
    <Box
      component="input"
      type="number"
      value={value}
      sx={getNumberInputSX}
      onKeyDown={handleKeyDown}
      onChange={handleChange}
    />
  );
};
