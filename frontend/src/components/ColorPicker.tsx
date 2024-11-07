import { alpha, Box, Popover, PopoverOrigin, Theme } from "@mui/material";
import { SystemStyleObject } from "@mui/system";
import { FunctionComponent, memo, useEffect, useMemo, useState } from "react";
import { ReactComponent as CheckIcon } from "../icons/check.svg";
import { createKeybindingsHandler } from "tinykeys";

export interface ColorPickerProps {
  colors: string[];
  value: string;
  onSelect: (value: string) => void;
}

const COLOR_NAMES: Record<string, string> = {
  "#FFFFFF": "White",
  "#B80000": "Red",
  "#DB3E00": "Orange",
  "#FCCB00": "Yellow",
  "#008B02": "Green",
  "#006B76": "Teal",
  "#1273DE": "Blue",
  "#3f51b5": "Violet",
  "#000000": "Black",
  "#ACABAB": "Dark grey",
  "#EB9694": "Light red",
  "#FAD0C3": "Light orange",
  "#FEF3BD": "Light yellow",
  "#C1E1C5": "Light green",
  "#BEDADC": "Light teal",
  "#C4DEF6": "Light blue",
  "#BED3F3": "Light violet",
  "#D7D7D7": "Light grey",
};

export const COLORS = Object.keys(COLOR_NAMES);

export const getColorName = (code: string): string => COLOR_NAMES[code] || code;

const COLOR_PICKER_CONTAINER_SX = {
  padding: "8px 12px",
  display: "flex",
  flexWrap: "wrap",
  rowGap: "3px",
  columnGap: "6px",
  width: "226px",
};

const ANCHOR_ORIGIN: PopoverOrigin = {
  vertical: "bottom",
  horizontal: "left",
};

const TRANSFORM_ORIGIN: PopoverOrigin = {
  vertical: "top",
  horizontal: "left",
};

const POPOVER_SX = {
  "& .MuiPopover-paper": (theme: Theme) => ({
    backgroundColor: "background.default",
    borderRadius: "5px",
    outline: `solid 1px ${theme.palette.grey[400]}`,
    boxShadow: `0 4px 7px 0 ${alpha(theme.palette.common.black, 0.1)}`,
    marginTop: "4px",
  }),
};

interface ColorProps {
  color: string;
  isSelected: boolean;
  isFocused: boolean;
  size?: number;
  onSelect: () => void;
}

export const Color: FunctionComponent<ColorProps> = ({
  color,
  onSelect,
  isSelected,
  isFocused,
}) => (
  <Box
    className="color-box"
    key={color}
    sx={(theme) => ({
      backgroundColor: color,
      width: "17px",
      height: "17px",
      outline: `solid 0.3px ${theme.palette.grey[400]}`,
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      border: isFocused ? `solid 2px ${theme.palette.secondary.main}` : null,
    })}
    onClick={onSelect}
  >
    {isSelected && <CheckIcon style={{ mixBlendMode: "difference" }} />}
  </Box>
);

export const ColorPicker: FunctionComponent<ColorPickerProps> = memo(
  ({ value, colors, onSelect }) => {
    const [focusedColorIdx, setFocusedColorIdx] = useState(() => {
      const index = colors.indexOf(value);
      return index === -1 ? 0 : index;
    });

    useEffect(() => {
      const eventListener = createKeybindingsHandler({
        ArrowLeft: () => {
          setFocusedColorIdx((idx) => {
            return (colors.length + idx - 1) % colors.length;
          });
        },
        ArrowRight: () => {
          setFocusedColorIdx((idx) => {
            return (idx + 1) % colors.length;
          });
        },
        ArrowDown: () => {
          setFocusedColorIdx((idx) => {
            return (idx + 9) % colors.length;
          });
        },
        ArrowUp: () =>
          setFocusedColorIdx((idx) => (colors.length + idx - 9) % colors.length),
        Tab: (e) => {
          setFocusedColorIdx((idx) => {
            return (idx + 1) % colors.length;
          });
        },
        Enter: (e) => {
          e.preventDefault();
          onSelect(colors[focusedColorIdx]);
        },
      });

      window.addEventListener("keydown", eventListener);

      return () => window.removeEventListener("keydown", eventListener);
    }, [colors, focusedColorIdx, onSelect]);

    return (
      <Box
        data-testid="color-list"
        className="color-list"
        sx={COLOR_PICKER_CONTAINER_SX}
      >
        {colors.map((color, idx) => (
          <Color
            key={color}
            color={color}
            isFocused={idx === focusedColorIdx}
            isSelected={color === value}
            onSelect={() => onSelect(color)}
          />
        ))}
      </Box>
    );
  }
);
ColorPicker.displayName = "ColorPicker";

export interface ColorPickerPopoverProps extends Omit<ColorPickerProps, "colors"> {
  id?: string;
  isOpen: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  colors?: string[];
  anchorOrigin?: PopoverOrigin;
  transformOrigin?: PopoverOrigin;
  sx?: SystemStyleObject<Theme>;
}

export const ColorPickerPopover: FunctionComponent<ColorPickerPopoverProps> = ({
  id,
  isOpen,
  anchorEl,
  onClose,
  colors = COLORS,
  anchorOrigin = ANCHOR_ORIGIN,
  transformOrigin = TRANSFORM_ORIGIN,
  sx,
  ...props
}) => (
  <Popover
    id={id}
    open={isOpen}
    anchorEl={anchorEl}
    onClose={onClose}
    anchorOrigin={anchorOrigin}
    transformOrigin={transformOrigin}
    PaperProps={useMemo(() => ({ sx: { "&.MuiPaper-root": sx || {} } }), [sx])}
    sx={POPOVER_SX}
  >
    <ColorPicker {...props} colors={colors} />
  </Popover>
);
