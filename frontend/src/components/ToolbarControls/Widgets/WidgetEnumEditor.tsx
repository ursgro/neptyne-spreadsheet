import React, { FunctionComponent, useCallback } from "react";
import { MenuItem, Select, SelectChangeEvent, Theme } from "@mui/material";
import { getWidgetInputSX } from "./WidgetParamEditor";
import { SystemStyleObject } from "@mui/system";
import { getNeptyneMenuDropdownSX } from "../../NeptyneDropdown";
import { VerticalArrowIcon } from "../../NeptyneIconButton";

interface WidgetEnumEditorProps {
  value?: string | null;
  options: {
    [key: string]: string;
  };
  onChange: (value: string) => void;
}

const getEnumSelectSX = (theme: Theme): SystemStyleObject<Theme> => ({
  ...getWidgetInputSX(theme),
  padding: 0,
  position: "relative",
  ".MuiSelect-select": {
    padding: "8px 32px 8px 8px",
  },
  ".MuiOutlinedInput-notchedOutline": {
    display: "none",
  },
  ".MuiIcon-root": {
    position: "absolute",
    top: "50%",
    right: "8px",
    transform: "translateY(-50%)",
    transitionProperty: "transform",
    transitionDuration: theme.transitions.duration.standard + "ms",
    transitionTimingFunction: theme.transitions.easing.easeOut,
    "&.MuiSelect-iconOpen": {
      transform: " translateY(-50%) rotate3d(1, 0, 0, 180deg)",
    },
  },
});

const MENU_PROPS = {
  sx: (theme: Theme) => ({
    ".MuiPaper-root": {
      ...getNeptyneMenuDropdownSX(theme),
      marginTop: "2px",
    },
  }),
};

export const WidgetEnumEditor: FunctionComponent<WidgetEnumEditorProps> = ({
  value,
  options,
  onChange,
}) => {
  const handleChange = useCallback(
    (event: SelectChangeEvent) => {
      onChange(event.target.value);
    },
    [onChange]
  );

  return (
    <Select
      value={value ?? ""}
      sx={getEnumSelectSX}
      onChange={handleChange}
      MenuProps={MENU_PROPS}
      IconComponent={VerticalArrowIcon}
    >
      {Object.entries(options).map(([key, value]) => (
        <MenuItem key={key} value={value}>
          {key + ": " + value}
        </MenuItem>
      ))}
    </Select>
  );
};
