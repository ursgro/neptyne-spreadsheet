import {
  ChangeEvent,
  FocusEvent,
  FunctionComponent,
  useCallback,
  useState,
} from "react";

import { Input, Theme } from "@mui/material";
import { NeptyneSnackbar } from "../../components/NeptyneSnackbar";

export interface SheetNameEditorProps {
  value: string;
  hasErrors: (value: string) => string | undefined;
  onSubmit: (value: string) => void;
  onRevert: () => void;
}

export const SheetNameEditor: FunctionComponent<SheetNameEditorProps> = ({
  value,
  onSubmit,
  onRevert,
  hasErrors,
}) => {
  const [sheetName, setSheetName] = useState(value);
  const [error, setError] = useState<string>();

  const submitIfPossible = useCallback(() => {
    if (value !== sheetName && !error) {
      onSubmit(sheetName);
    } else {
      onRevert();
    }
  }, [onRevert, onSubmit, sheetName, value, error]);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setSheetName(e.target.value);
      setError(hasErrors(e.target.value));
    },
    [hasErrors]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const keyCode = e.key;
      const ENTER_KEY = "Enter";
      const ESCAPE_KEY = "Escape";
      if (keyCode === ENTER_KEY) {
        submitIfPossible();
      }
      if (keyCode === ESCAPE_KEY) {
        onRevert();
      }
      e.stopPropagation();
    },
    [onRevert, submitIfPossible]
  );

  return (
    <>
      <NeptyneSnackbar
        isOpen={!!error}
        content={error}
        severity="error"
        onClick={() => setError(undefined)}
      />

      <Input
        disableUnderline
        data-testid="sheet-rename-input"
        aria-label="sheet name input"
        autoFocus
        onFocus={handleFocus}
        error={!!error}
        size="small"
        color="secondary"
        value={sheetName}
        onChange={handleChange}
        onBlur={submitIfPossible}
        onKeyDown={handleKeyDown}
        margin="none"
        sx={(neptyneTheme: Theme) => ({
          ...neptyneTheme.typography.button,
          width: `${sheetName.length}ch`,
          color: "text.primary",
          backgroundColor: `${neptyneTheme.palette.secondary.main}${Math.round(
            0.35 * 255
          ).toString(16)}`, // #rrggbbaa with opacity of 0.35
          borderRadius: "3px",
          "& .MuiInput-input.MuiInputBase-input": {
            margin: "0 1px",
            padding: "0",
          },
        })}
      />
    </>
  );
};

const handleFocus = (e: FocusEvent<HTMLInputElement>) => e.target && e.target.select();
