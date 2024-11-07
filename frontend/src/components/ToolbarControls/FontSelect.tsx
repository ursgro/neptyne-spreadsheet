import { FunctionComponent, useCallback } from "react";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import Select, { SelectChangeEvent } from "@mui/material/Select";
import { ALLOWED_FONTS } from "../../SheetUtils";

const MENU_ITEM_OPTIONS = ALLOWED_FONTS.map((font) => (
  <MenuItem key={font.label} sx={{ fontFamily: font.cssName }} value={font.cssName}>
    {font.label}
  </MenuItem>
));

const FORM_CONTROL_SX = { m: 1 };

interface FontSelectProps {
  value: string;
  testId?: string;
  onSelect: (value: string) => void;
}

export const FontSelect: FunctionComponent<FontSelectProps> = ({
  value,
  testId,
  onSelect,
}) => {
  const handleChange = useCallback(
    (event: SelectChangeEvent) => {
      onSelect(event.target.value);
    },
    [onSelect]
  );
  return (
    <FormControl sx={FORM_CONTROL_SX} size="small" color="secondary">
      <Select
        data-testid={testId}
        value={value}
        onChange={handleChange}
        color="secondary"
        SelectDisplayProps={{ id: "font-select", onClick: (e) => e.stopPropagation() }}
        MenuProps={{ id: "font-select-menu" }}
      >
        {MENU_ITEM_OPTIONS}
      </Select>
    </FormControl>
  );
};
