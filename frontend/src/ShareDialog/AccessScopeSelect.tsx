import { Stack, Select, MenuItem, Typography, Box } from "@mui/material";
import { FunctionComponent } from "react";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import CorporateFareIcon from "@mui/icons-material/CorporateFare";
import PublicIcon from "@mui/icons-material/Public";

import { AccessScope, AccessLevel } from "../NeptyneProtocol";
import { AccessLevelSelect } from "./AccessLevelSelect";
import { useFeatureFlags } from "../feature-flags";

const AccessScopeIcon: FunctionComponent<{
  accessScope: AccessScope;
}> = ({ accessScope }) => {
  let icon;
  switch (accessScope) {
    case AccessScope.Restricted:
      icon = <LockOutlinedIcon />;
      break;
    case AccessScope.Team:
      icon = <CorporateFareIcon />;
      break;
    case AccessScope.Anyone:
      icon = <PublicIcon />;
      break;
  }
  return (
    <Box
      sx={(theme) => ({
        backgroundColor: theme.palette.secondary.lightBackground,
        color: theme.palette.secondary.main,
        borderRadius: "50%",
        width: "40px",
        height: "40px",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      })}
    >
      {icon}
    </Box>
  );
};

const AccessScopeText: FunctionComponent<{
  accessScope: AccessScope;
  accessLevel: AccessLevel;
}> = ({ accessScope, accessLevel }) => {
  let text;
  switch (accessScope) {
    case AccessScope.Restricted:
      text = "Only people with access can open with the link.";
      break;
    case AccessScope.Team:
      text = `Anyone in this team with the link can ${accessLevel.toLowerCase()}.`;
      break;
    case AccessScope.Anyone:
      text = "Anyone on the internet with the link can view.";
      break;
  }
  return <Typography variant="subtitle1">{text}</Typography>;
};

interface AccessScopeSelectProps {
  accessScope: AccessScope;
  accessLevel: AccessLevel;
  teamName?: string;
  onAccessScopeChange: (editLevel: AccessScope) => void;
  onAccessLevelChange: (accessLevel: AccessLevel) => void;
}

export const AccessScopeSelect: FunctionComponent<AccessScopeSelectProps> = ({
  accessScope,
  accessLevel,
  onAccessScopeChange,
  onAccessLevelChange,
}) => {
  const { isFeatureEnabled } = useFeatureFlags();

  let scopes: AccessScope[];
  if (isFeatureEnabled("organization-sharing") || accessScope === AccessScope.Team) {
    scopes = [AccessScope.Restricted, AccessScope.Team, AccessScope.Anyone];
  } else {
    scopes = [AccessScope.Restricted, AccessScope.Anyone];
  }

  return (
    <Stack direction="row" alignItems="center" gap="10px">
      <Box>
        <AccessScopeIcon accessScope={accessScope} />
      </Box>
      <Box>
        <Stack direction="column" alignItems="flex-start" gap="3px">
          <Select
            size="small"
            variant="standard"
            color="secondary"
            value={accessScope}
            sx={{ textTransform: "capitalize" }}
            onChange={(event) => onAccessScopeChange(event.target.value as AccessScope)}
            MenuProps={{
              anchorPosition: { top: 0, left: -14 },
            }}
          >
            {scopes.map((scope) => (
              <MenuItem key={scope} value={scope}>
                <Typography variant="h3" textTransform="capitalize">
                  {scope}
                </Typography>
              </MenuItem>
            ))}
          </Select>

          <AccessScopeText accessScope={accessScope} accessLevel={accessLevel} />
        </Stack>
      </Box>
      {accessScope !== AccessScope.Restricted && accessScope !== AccessScope.Anyone && (
        <Box marginLeft="auto">
          <AccessLevelSelect
            accessLevel={accessLevel}
            onAccessLevelChange={onAccessLevelChange}
          />
        </Box>
      )}
    </Stack>
  );
};
