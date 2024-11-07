import { Select, MenuItem } from "@mui/material";
import { FunctionComponent } from "react";
import { AccessLevel } from "../NeptyneProtocol";

interface AccessLevelSelectProps {
  accessLevel: AccessLevel;
  onAccessLevelChange: (accessLevel: AccessLevel) => void;
  canSelectOwner?: boolean;
  disabled?: boolean;
}

export const AccessLevelSelect: FunctionComponent<AccessLevelSelectProps> = ({
  accessLevel,
  onAccessLevelChange,
  canSelectOwner,
  disabled,
}) => (
  <Select
    data-testid="access-level-select"
    size="small"
    variant="standard"
    color="secondary"
    value={accessLevel}
    sx={{ textTransform: "capitalize" }}
    disabled={disabled}
    onChange={(event) => {
      onAccessLevelChange(event.target.value as AccessLevel);
    }}
  >
    {Object.entries(AccessLevel)
      .filter(([, value]) => canSelectOwner || value !== AccessLevel.Owner)
      .map(([repr, value]) => (
        <MenuItem key={value} value={value}>
          {repr}
        </MenuItem>
      ))}
  </Select>
);
