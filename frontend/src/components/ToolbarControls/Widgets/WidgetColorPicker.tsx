import { Box, Theme } from "@mui/material";
import { SystemStyleObject } from "@mui/system";
import { FunctionComponent, useMemo, useState } from "react";
import {
  Color,
  ColorPickerPopover,
  ColorPickerPopoverProps,
  getColorName,
} from "../../ColorPicker";
import { VerticalArrowIcon } from "../../NeptyneIconButton";

interface WidgetColorPickerProps {
  value: string;
  onChanges: (newValue: string) => void;
}

const COLOR_PICKER_POPOVER_STATIC_PROPS: Omit<
  ColorPickerPopoverProps,
  "isOpen" | "anchorEl" | "onClose" | "value" | "onSelect"
> = {
  anchorOrigin: {
    vertical: "bottom",
    horizontal: "right",
  },
  transformOrigin: {
    vertical: "top",
    horizontal: "right",
  },
  sx: {
    marginTop: "8px",
    "& .color-list": {
      rowGap: "6px",
      "& .color-box": {
        borderRadius: "3px",
      },
    },
  },
};

const COLOR_PICKER_WRAPPER_SX: SystemStyleObject = {
  borderRadius: "3px",
  height: "34px",
  backgroundColor: "secondary.hover",
  position: "relative",
  padding: "8px",
  width: "100%",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  "& .suffix": {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    columnGap: "5px",
    width: "20px",
    height: "20px",
    textAlign: "center",
    "& .color-box": {
      width: "20px",
      height: "20px",
      borderRadius: "3px",
    },
    "& .vertical-arrow-icon": {
      color: "text.primary",
    },
  },
};

const COLOR_WRAPPER_SX = { float: "right", marginLeft: "10px" };

const noop = () => {};

export const WidgetColorPicker: FunctionComponent<WidgetColorPickerProps> = ({
  value,
  onChanges,
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const handleClick = (event: React.MouseEvent<HTMLElement>) =>
    setAnchorEl(event.currentTarget);

  const handleClose = () => setAnchorEl(null);

  const open = !!anchorEl;
  const id = open ? "widget-color-popover" : undefined;

  const wrapperSx = useMemo(
    () => [
      COLOR_PICKER_WRAPPER_SX,
      (theme: Theme) =>
        open
          ? {
              backgroundColor: theme.palette.secondary.selectedButtonBackground,
              outline: `1px solid ${theme.palette.secondary.selectedButtonBorder}`,
            }
          : {},
    ],
    [open]
  );

  return (
    <>
      <Box onClick={handleClick} sx={wrapperSx}>
        <Box>{getColorName(value)}</Box>
        <Box className="suffix">
          {value && (
            <Box sx={COLOR_WRAPPER_SX}>
              <Color
                color={value}
                isSelected={false}
                isFocused={false}
                onSelect={noop}
              />
            </Box>
          )}
          <VerticalArrowIcon isActive={open} />
        </Box>
      </Box>
      <ColorPickerPopover
        id={id}
        isOpen={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        value={value}
        onSelect={(value) => {
          handleClose();
          onChanges(value);
        }}
        {...COLOR_PICKER_POPOVER_STATIC_PROPS}
      />
    </>
  );
};
