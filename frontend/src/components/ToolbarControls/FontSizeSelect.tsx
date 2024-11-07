import Autocomplete, {
  AutocompleteRenderInputParams,
} from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { FunctionComponent, SyntheticEvent, useCallback } from "react";

interface FontSizeSelectProps {
  value: number;
  testId?: string;
  onSelect: (value: number) => void;
}

export const FONT_SIZE_STEP = 2;
export const DEFAULT_FONT_SIZE = 10;

const FONT_SIZES = [6, 7, 8, 9, 10, 11, 12, 14, 18, 24, 36];
const OPTIONS = FONT_SIZES.map((fontSize) => fontSize.toString());

const RENDER_INPUT = (params: AutocompleteRenderInputParams) => (
  <TextField onClick={(e) => e.stopPropagation()} {...params} />
);

const GREEN_BORDER_SX = {
  "& .MuiOutlinedInput-root": {
    "&.Mui-focused fieldset": {
      borderColor: "secondary.selectedButtonBorder",
    },
  },
};

export const FontSizeSelect: FunctionComponent<FontSizeSelectProps> = ({
  value,
  testId,
  onSelect,
}) => {
  const handleOnChange = useCallback(
    (e: SyntheticEvent, value: string) => onSelect(parseInt(value)),
    [onSelect]
  );
  return (
    <Autocomplete
      data-testid={testId}
      size="small"
      color="secondary"
      freeSolo
      disableClearable
      options={OPTIONS}
      renderInput={RENDER_INPUT}
      onChange={handleOnChange}
      value={value.toString()}
      sx={GREEN_BORDER_SX}
    />
  );
};
