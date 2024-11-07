import {
  Autocomplete,
  AutocompleteChangeReason,
  Box,
  Stack,
  TextField,
  Typography,
  createFilterOptions,
} from "@mui/material";
import { UserAvatar } from "../components/UserAvatar";
import { FunctionComponent } from "react";

export interface UserEmail {
  email: string;
  name: string | null;
}

const filter = createFilterOptions<UserEmail>();

const renderUserEmail = ({ name, email }: UserEmail) => {
  if (name !== null) {
    return `${name} <${email}>`;
  }
  return email;
};

const looksLikeAnEmailAddress = (e: string) => {
  const bits = e.split("@");
  if (bits.length !== 2) {
    return false;
  }
  return bits[1].includes(".");
};

interface ShareAutocompleteProps {
  inputValue: string;
  value: UserEmail[];
  options: UserEmail[];
  loading: boolean;
  onChange: (value: UserEmail[], reason: AutocompleteChangeReason) => void;
  onInputValueChange: (value: string) => void;
}

export const ShareAutocomplete: FunctionComponent<ShareAutocompleteProps> = ({
  inputValue,
  value,
  options,
  loading,
  onChange,
  onInputValueChange,
}) => (
  <Autocomplete
    data-testid="share-autocomplete"
    style={{
      display: "flex",
      flexGrow: 1,
      paddingTop: "10px",
    }}
    color="secondary"
    size="small"
    multiple
    inputValue={inputValue}
    options={options}
    getOptionLabel={renderUserEmail}
    value={value}
    filterOptions={(options: UserEmail[], params) => {
      const filtered = filter(options, params);

      const { inputValue } = params;
      const isExisting = options.some((option) => inputValue === option.email);
      if (inputValue !== "" && !isExisting && looksLikeAnEmailAddress(inputValue)) {
        filtered.push({ email: inputValue, name: null });
      }

      return filtered;
    }}
    renderInput={(params) => (
      <TextField
        {...params}
        color="secondary"
        label=""
        placeholder="Add people and groups"
        disabled={loading}
      />
    )}
    onChange={(event, newValue, reason) => onChange(newValue, reason)}
    onInputChange={(event, value, reason) =>
      reason === "input" && onInputValueChange(value)
    }
    renderOption={(props, option, { selected }) => (
      <li {...props}>
        <Stack direction="row" alignItems="center" gap="10px">
          <Box>
            <UserAvatar name={option.name || option.email} email={option.email} />
          </Box>
          <Box>
            <Stack direction="column" alignItems="flex-start" gap="3px">
              <Box>
                <Typography variant="h3">{option.name || option.email}</Typography>
              </Box>
              <Box>{option.email}</Box>
            </Stack>
          </Box>
        </Stack>
      </li>
    )}
  />
);
