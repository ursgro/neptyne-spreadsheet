import React, { CSSProperties, ReactNode, useContext, useEffect } from "react";
import Button from "@mui/material/Button";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import {
  FormControl,
  InputBase,
  InputLabel,
  MenuItem,
  Select,
  styled,
  Theme,
} from "@mui/material";
import { SystemStyleObject } from "@mui/system";
import Stack from "@mui/material/Stack";

import { NeptyneDialog } from "./NeptyneDialog";
import { CapabilitiesContext } from "./capabilities";
import TextField from "@mui/material/TextField";
import { FeatureFlagsContext } from "./feature-flags";

enum DropDownValue {
  AUTO = 0,
  SCHEDULED = 1,
}

type Unit = "seconds" | "minutes" | "hours" | "days";

const unitLabel = (unit: Unit, plural?: boolean) => {
  return (
    {
      seconds: "Second",
      minutes: "Minute",
      hours: "Hour",
      days: "Day",
    }[unit] + (plural ? "s" : "")
  );
};

interface IntervalDialogProps {
  open: boolean;
  value: number;
  unit: Unit;
  onClose: (value?: number, unit?: Unit) => void;
}

const intervalInputStyles = (theme: Theme) => ({
  borderRadius: 4,
  position: "relative",
  backgroundColor: theme.palette.background.paper,
  border: "1px solid #ced4da",
  padding: "6px 26px 6px 12px",
  minWidth: "50px",
});

const IntervalDialogSelectInput = styled(InputBase)(({ theme }) => ({
  "& .MuiInputBase-input": intervalInputStyles(theme),
}));
const IntervalTextField = styled(TextField)(({ theme }) => ({
  "& .MuiInputBase-input": intervalInputStyles(theme),
}));

const selectSX = (theme: Theme): SystemStyleObject => ({
  ...theme.typography.button,
  height: "32px",
  boxSizing: "border-box",
  backgroundColor: "secondary.main",
  color: "secondary.contrastText",
  marginLeft: "5px",
  "& .MuiSelect-icon": {
    color: "secondary.contrastText",
  },
  "& .MuiOutlinedInput-notchedOutline": {
    border: "none",
  },
});

const toSeconds = (value: number, unit: string) => {
  if (unit === "days") {
    value *= 60 * 60 * 24;
  } else if (unit === "hours") {
    value *= 60 * 60;
  } else if (unit === "minutes") {
    value *= 60;
  }
  return value;
};

const fromSeconds = (value: number): [number, Unit] => {
  if (value > 0 && value % (3600 * 24) === 0) {
    return [value / (3600 * 24), "days"];
  } else if (value > 0 && value % 3600 === 0) {
    return [value / 3600, "hours"];
  } else if (value > 0 && value % 60 === 0) {
    return [value / 60, "minutes"];
  }
  return [value, "seconds"];
};

export const IntervalDialog = ({ open, value, unit, onClose }: IntervalDialogProps) => {
  const { minTickFrequencySeconds, hasPremium } = useContext(CapabilitiesContext);
  const { isFeatureEnabled } = useContext(FeatureFlagsContext);
  const valueSeconds = toSeconds(value, unit);
  const [minValueMinUnit, minUnit] = fromSeconds(minTickFrequencySeconds);
  if (valueSeconds < minTickFrequencySeconds) {
    value = minValueMinUnit;
    unit = minUnit;
  }
  const [newValue, setNewValue] = React.useState(value);
  const [newUnit, setNewUnit] = React.useState(unit);
  let validationError: ReactNode | null;

  useEffect(() => {
    if (open) {
      setNewValue(value);
      setNewUnit(unit);
    }
    // When open => false -> true, we want to reset state to props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const setUnit = (unit: Unit) => {
    if (toSeconds(newValue, unit) < minTickFrequencySeconds) {
      [value] = fromSeconds(minTickFrequencySeconds);
      setNewValue(value);
    }
    setNewUnit(unit);
  };

  if (!(newValue > 0)) {
    validationError = <em>Interval must be a positive number.</em>;
  } else if (toSeconds(newValue, newUnit) < minTickFrequencySeconds) {
    validationError = (
      <em>{`The minimum interval is ${minValueMinUnit} ${unitLabel(
        minUnit,
        minValueMinUnit > 1
      )}.`}</em>
    );
    if (!hasPremium && isFeatureEnabled("show-premium-prompt")) {
      validationError = (
        <>
          {validationError}
          <br />
          For higher-frequency updates, check out{" "}
          <a href="/--/subscription">Neptyne Pro</a>.
        </>
      );
    }
  } else {
    validationError = null;
  }

  const availableUnits: Unit[] = ["days", "hours"];
  // These might look off-by-one but the point is to allow one more level of
  // granularity than the minimum tick frequency would imply.
  if (minTickFrequencySeconds < 60 * 60 * 24) {
    availableUnits.push("minutes");
  }
  if (minTickFrequencySeconds < 60 * 60) {
    availableUnits.push("seconds");
  }

  const handleCancel = () => {
    onClose();
  };

  const handleAccept = () => {
    if (validationError) {
      onClose();
    } else {
      onClose(newValue, newUnit);
    }
  };

  const leftStyle: CSSProperties = { float: "left", width: "45%" };
  const rightStyle: CSSProperties = { float: "right", width: "45%" };
  const dialogLabel = "form-dialog-title";
  const showWarning = toSeconds(newValue, newUnit) < 60 * 15;
  return (
    <NeptyneDialog
      open={open}
      onClose={handleCancel}
      onConfirm={handleAccept}
      ariaLabel={dialogLabel}
    >
      <DialogTitle id={dialogLabel}>Interval</DialogTitle>
      <DialogContent sx={{ width: "350px" }}>
        <Stack direction="column" spacing={1.5}>
          <DialogContentText>Enter the cell's update interval.</DialogContentText>
          <Stack direction="row">
            <div style={leftStyle}>
              <InputLabel id="interval-select-label">Quantity</InputLabel>
              <IntervalTextField
                inputProps={{ inputMode: "numeric", pattern: "[0-9]*" }}
                sx={{
                  maxWidth: "100px",
                }}
                onChange={(event) => {
                  const digits = event.target.value.replace(/\D/g, "");
                  setNewValue(parseInt(digits, 10));
                }}
                value={isNaN(newValue) ? "" : newValue}
                error={!!validationError}
              />
            </div>
            <div style={rightStyle}>
              <InputLabel id="unit-select-label">Unit</InputLabel>
              <Select
                labelId="unit-select-label"
                id="unit-select-label"
                value={newUnit}
                onChange={(event) => {
                  setUnit(event.target.value as Unit);
                }}
                input={<IntervalDialogSelectInput />}
              >
                {availableUnits.map((unit) => (
                  <MenuItem key={unit} value={unit}>
                    {unitLabel(unit)}
                  </MenuItem>
                ))}
              </Select>
            </div>
          </Stack>
          {validationError && <DialogContentText>{validationError}</DialogContentText>}
          {!validationError && showWarning && (
            <DialogContentText>
              <em>
                Note: when there is no user activity on the tyne, the cells will run a
                maximum of once every 15 minutes.
              </em>
            </DialogContentText>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel} color="primary">
          Cancel
        </Button>
        <Button onClick={handleAccept} color="primary" disabled={!!validationError}>
          OK
        </Button>
      </DialogActions>
    </NeptyneDialog>
  );
};

interface ExecutionPolicyProps {
  value: number;
  valueChanged: (newValue: number) => void;
  readOnly: boolean;
}

export const ExecutionPolicy = ({
  value,
  valueChanged,
  readOnly,
}: ExecutionPolicyProps) => {
  const [open, setOpen] = React.useState(false);

  const handleClose = (value?: number, unit?: string) => {
    setOpen(false);
    if (value && unit) {
      valueChanged(toSeconds(value, unit));
    }
  };

  const dropDownValue = value > 0 ? DropDownValue.SCHEDULED : DropDownValue.AUTO;

  const [unitValue, unit] = fromSeconds(value);

  const scheduledCaption =
    dropDownValue === DropDownValue.SCHEDULED
      ? unitValue + " " + unitLabel(unit, unitValue > 1) + " Repeat"
      : "Scheduled";

  return (
    <div>
      <FormControl>
        <Select
          disabled={readOnly}
          sx={selectSX}
          value={dropDownValue}
          onChange={(event) => {
            const value = event.target.value as number;
            if (value === DropDownValue.AUTO) {
              valueChanged(value);
            } else {
              setOpen(true);
            }
          }}
        >
          <MenuItem value={DropDownValue.AUTO}>Auto</MenuItem>
          <MenuItem
            value={DropDownValue.SCHEDULED}
            onClick={() => {
              setOpen(true);
            }}
          >
            {scheduledCaption}
          </MenuItem>
        </Select>
      </FormControl>
      <IntervalDialog open={open} onClose={handleClose} value={unitValue} unit={unit} />
    </div>
  );
};
