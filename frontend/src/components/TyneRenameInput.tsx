import { alpha, Box, Theme } from "@mui/material";
import React, { forwardRef, useCallback, useEffect, useState } from "react";
import { SystemStyleObject } from "@mui/system";

interface TyneRenameInputProps {
  initialValue: string;
  onFocus: React.FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  onRename: (name: string) => void;
  readOnly?: boolean;
}

const HEIGHT_CONTAINER = 24; // PX

const HEIGHT_INPUT = 14; // PX

const getTransitions = (theme: Theme): SystemStyleObject => ({
  transitionDuration: theme.transitions.duration.standard + "ms",
  transitionTimingFunction: theme.transitions.easing.easeOut,
  transitionProperty: "color, background-color",
});

const getContainerSX = (theme: Theme): SystemStyleObject => ({
  ...getTransitions(theme),
  ...theme.typography.button,
  backgroundColor: "grey.300",
  border: "2px solid",
  borderColor: theme.palette.grey[300],
  borderRadius: "5px",
  boxSizing: "content-box",
  flexShrink: "0",
  height: HEIGHT_CONTAINER + "px",
  "&:focus-within": {
    backgroundColor: "secondary.selectedButtonBackground",
    borderColor: theme.palette.secondary.main,
  },
});

const getInputSX = (theme: Theme): SystemStyleObject => ({
  ...getTransitions(theme),
  ...theme.typography.button,
  appearance: "none",
  backgroundColor: "transparent",
  border: "0",
  borderRadius: "3px",
  fontSize: "inherit",
  height: HEIGHT_INPUT + "px",
  lineHeight: HEIGHT_INPUT + "px",
  margin: (HEIGHT_CONTAINER - HEIGHT_INPUT) / 2 + "px",
  padding: "0 4px",
  width: "190px",
  "&:focus": {
    backgroundColor: theme.palette.secondary.main,
    color: theme.palette.secondary.contrastText,
    outline: "none",
  },
  "&::selection": {
    backgroundColor: alpha(theme.palette.secondary.dark, 0.5),
  },
});

export const TyneRenameInput = forwardRef<HTMLInputElement, TyneRenameInputProps>(
  ({ initialValue, onRename, readOnly, ...props }, ref) => {
    const [value, setValue] = useState(initialValue);

    useEffect(() => {
      setValue(initialValue);
    }, [initialValue]);

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLInputElement>) => {
        const target = event.target as HTMLInputElement;
        if (["Escape", "Enter"].includes(event.key)) {
          if (event.key === "Escape") {
            setValue(initialValue);
            // Preventing race condition between react state and blur event.
            // Looks dirty, ik.
            target.value = initialValue;
          }
          event.preventDefault();
          target.blur();
        }
      },
      [initialValue]
    );

    const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
      setValue(event.target.value);
    }, []);

    const handleBlur = useCallback(
      (event: React.FocusEvent<HTMLInputElement>) => {
        if (readOnly) {
          return;
        }
        if (event.target.value !== initialValue) {
          onRename(event.target.value);
        }
      },
      [onRename, initialValue, readOnly]
    );

    return (
      <Box sx={getContainerSX}>
        <Box
          {...props}
          ref={ref}
          sx={getInputSX}
          component="input"
          disabled={!!readOnly}
          type="text"
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
      </Box>
    );
  }
);
