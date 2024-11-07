import React, { FunctionComponent, useContext, useEffect } from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import {
  Checkbox,
  CircularProgress,
  FormControlLabel,
  IconButton,
  Link,
  Stack,
  Typography,
} from "@mui/material";
import Box from "@mui/material/Box";

import { NeptyneDialog } from "../NeptyneDialog";
import {
  AccessLevel,
  AccessScope,
  ShareRecord,
  TyneShareResponse,
} from "../NeptyneProtocol";
import { NeptyneSnackbar } from "../components/NeptyneSnackbar";
import { UserAvatar, UserAvatarProps } from "../components/UserAvatar";
import { AccessLevelSelect } from "./AccessLevelSelect";
import { AccessScopeSelect } from "./AccessScopeSelect";
import { ShareAutocomplete, UserEmail } from "./ShareAutocomplete";
import DeleteIcon from "@mui/icons-material/Delete";
import { FeatureFlagsContext } from "../feature-flags";
import { useUserInfo } from "../user-context";

interface Props {
  open: boolean;
  shares: ShareRecord[];
  users: UserEmail[];
  loading: boolean;
  generalAccessLevel: AccessLevel;
  generalAccessScope: AccessScope;
  tyneDescription: string;
  tyneName: string;
  shareMessage?: string;
  onSubmit: (response: TyneShareResponse) => void;
  onClose: () => void;
  canAccessShareRecords: boolean;
  isApp: boolean;
}

export default function ShareDialog(props: Props) {
  const {
    shares: sharesProp,
    users,
    loading,
    shareMessage: shareMessageProp,
    tyneDescription,
    tyneName,
    onSubmit,
    onClose,
    generalAccessLevel: generalAccessLevelProp,
    generalAccessScope: generalAccessScopeProp,
    canAccessShareRecords,
    isApp,
  } = props;

  const { isFeatureEnabled } = useContext(FeatureFlagsContext);
  const { organizationName } = useUserInfo();

  const [shares, setShares] = React.useState<ShareRecord[]>(sharesProp);
  const [invitedUsers, setInvitedUsers] = React.useState<UserEmail[]>([]);
  const [invitedUserAccessLevel, setInvitedUserAccessLevel] =
    React.useState<AccessLevel>(AccessLevel.View);
  const [inputValue, setInputValue] = React.useState("");
  const [shareMessage, setShareMessage] = React.useState(shareMessageProp);
  const [updatedDescription, setUpdatedDescription] = React.useState<string | null>(
    null
  );
  const [notification, setNotification] = React.useState<string>();
  const [accessLevel, setAccessLevel] =
    React.useState<AccessLevel>(generalAccessLevelProp);
  const [accessScope, setAccessScope] =
    React.useState<AccessScope>(generalAccessScopeProp);
  const [showShareRecords, setShowShareRecords] =
    React.useState<boolean>(canAccessShareRecords);
  const [isAppChecked, setIsAppChecked] = React.useState<boolean>(false);

  useEffect(() => {
    setShares(sharesProp);
  }, [sharesProp]);

  useEffect(() => {
    setAccessLevel(generalAccessLevelProp);
  }, [generalAccessLevelProp]);

  useEffect(() => {
    setAccessScope(generalAccessScopeProp);
  }, [generalAccessScopeProp]);

  useEffect(() => {
    setUpdatedDescription(tyneDescription);
  }, [tyneDescription]);

  useEffect(() => {
    setShowShareRecords(canAccessShareRecords);
  }, [canAccessShareRecords]);

  useEffect(() => {
    setIsAppChecked(isApp);
  }, [isApp]);

  const sharingToOrgButNotPartOfOrg =
    !organizationName && accessScope === AccessScope.Team;

  const handleSubmit = () => {
    onSubmit({
      shares: [
        ...shares,
        ...invitedUsers.map((user) => ({
          ...user,
          access_level: invitedUserAccessLevel,
        })),
      ],
      shareMessage,
      description: updatedDescription !== null ? updatedDescription : tyneDescription,
      users: [],
      generalAccessLevel: accessLevel,
      generalAccessScope: accessScope,
      isApp: isAppChecked && accessScope === AccessScope.Anyone,
    });
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setNotification("Link copied");
  };

  const renderInviteUserPanel = () => {
    return (
      <DialogContent sx={{ paddingBottom: "0px" }}>
        {loading && (
          <Box display="flex" justifyContent="center">
            <CircularProgress />
          </Box>
        )}
        <Stack direction="row" gap="15px" alignItems="baseline">
          <ShareAutocomplete
            value={invitedUsers}
            inputValue={inputValue}
            loading={loading}
            onChange={(value, reason) => {
              setInvitedUsers(value);
              reason === "selectOption" && setInputValue("");
            }}
            onInputValueChange={setInputValue}
            options={users}
          />
          {!!invitedUsers.length && (
            <Box>
              <AccessLevelSelect
                accessLevel={invitedUserAccessLevel}
                onAccessLevelChange={setInvitedUserAccessLevel}
                canSelectOwner={false}
              />
            </Box>
          )}
        </Stack>
      </DialogContent>
    );
  };

  const renderShareRecordsPanel = () => {
    return invitedUsers.length ? (
      <DialogContent sx={{ paddingTop: "0px", paddingBottom: "0px" }}>
        <Stack direction="column">
          <FormControlLabel control={<Checkbox checked />} label="Notify people" />
          <TextField
            label="Message"
            color="secondary"
            multiline
            rows={4}
            value={shareMessage}
            onChange={(e) => setShareMessage(e.target.value)}
          />
        </Stack>
      </DialogContent>
    ) : (
      <>
        <DialogTitle sx={{ paddingBottom: "15px" }}>
          <Typography style={{ fontSize: 18 }}>People with access</Typography>
        </DialogTitle>
        <DialogContent>
          <Stack direction="column" gap="10px">
            {shares.map(({ email, name, access_level }) => (
              <PersonAccess
                key={email}
                accessLevel={access_level}
                onAccessLevelChange={(accessLevel) => {
                  setShares(
                    shares.map((sr) =>
                      sr.email === email
                        ? {
                            ...sr,
                            access_level: accessLevel,
                          }
                        : sr
                    )
                  );
                }}
                onShareRemove={() => {
                  setShares(shares.filter((sr) => sr.email !== email));
                }}
                name={name || email}
                email={email}
              />
            ))}
          </Stack>
        </DialogContent>
        <DialogTitle sx={{ paddingTop: 0, paddingBottom: "15px" }}>
          <Typography style={{ fontSize: 18 }}>General access</Typography>
        </DialogTitle>
        <DialogContent>
          <AccessScopeSelect
            accessLevel={accessLevel}
            accessScope={accessScope}
            onAccessLevelChange={setAccessLevel}
            onAccessScopeChange={setAccessScope}
          />
          {sharingToOrgButNotPartOfOrg && (
            <Typography variant="subtitle1" color="error">
              You are not part of an organization. Create one{" "}
              <Link href="/--/organization">here.</Link>
            </Typography>
          )}
          {isFeatureEnabled("app-mode-share-button") &&
            accessScope === AccessScope.Anyone && (
              <FormControlLabel
                control={<Checkbox checked={isAppChecked} />}
                label="Publish as an app"
                onChange={(event, checked) => {
                  setIsAppChecked(checked);
                }}
              />
            )}
        </DialogContent>

        <DialogTitle sx={{ paddingTop: 0, paddingBottom: "15px" }}>
          <Typography style={{ fontSize: 18 }}>Tyne Description</Typography>
        </DialogTitle>
        <DialogContent>
          <Stack direction="column" sx={{ paddingTop: "8px" }}>
            <TextField
              label="Tyne description"
              color="secondary"
              multiline
              rows={4}
              value={updatedDescription}
              InputLabelProps={{ shrink: !!updatedDescription }}
              onChange={(e) => setUpdatedDescription(e.target.value)}
            />
          </Stack>
        </DialogContent>
      </>
    );
  };

  return (
    <NeptyneDialog
      open
      onClose={onClose}
      onConfirm={handleSubmit}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle sx={{ padding: "24px 24px 6px 24px" }}>
        <Typography style={{ fontSize: 22 }}>
          {!!invitedUsers.length && (
            <IconButton
              onClick={() => setInvitedUsers([])}
              sx={{ padding: "0px", marginRight: "5px" }}
            >
              <ArrowBackIcon />
            </IconButton>
          )}
          Share "{tyneName}"
        </Typography>
      </DialogTitle>

      {showShareRecords ? renderInviteUserPanel() : <></>}
      {showShareRecords ? renderShareRecordsPanel() : <></>}
      <DialogActions sx={{ padding: "24px" }}>
        <Button
          onClick={handleCopyLink}
          color="secondary"
          variant="outlined"
          sx={{ marginRight: "auto" }}
        >
          Copy Link
        </Button>
        {invitedUsers.length ? (
          <>
            <Button onClick={() => setInvitedUsers([])} color="secondary">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              color="secondary"
              variant="contained"
              disabled={loading}
            >
              Send
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose} color="secondary">
              Cancel
            </Button>
            {showShareRecords ? (
              <Button
                onClick={handleSubmit}
                color="secondary"
                variant="contained"
                disabled={loading || sharingToOrgButNotPartOfOrg}
              >
                Save
              </Button>
            ) : (
              <></>
            )}
          </>
        )}
      </DialogActions>
      {!!notification && (
        <NeptyneSnackbar
          isOpen={!!notification}
          content={notification}
          severity="success"
          onClick={() => setNotification(undefined)}
          onClose={() => setNotification(undefined)}
        />
      )}
    </NeptyneDialog>
  );
}

interface PersonAccessProps extends UserAvatarProps {
  accessLevel: AccessLevel;
  onAccessLevelChange: (accessLevel: AccessLevel) => void;
  onShareRemove: () => void;
}

const PersonAccess: FunctionComponent<PersonAccessProps> = ({
  accessLevel,
  onAccessLevelChange,
  onShareRemove,
  ...props
}) => (
  <Stack
    direction="row"
    alignItems="center"
    gap="10px"
    data-testid={`person-access-${props.name}`}
  >
    <Box>
      <UserAvatar {...props} />
    </Box>
    <Box>
      <Stack direction="column" alignItems="flex-start" gap="3px">
        <Box>
          <Typography variant={"h4"}>{props.name}</Typography>
        </Box>
        <Box>{props.email}</Box>
      </Stack>
    </Box>
    <Box marginLeft="auto">
      <AccessLevelSelect
        canSelectOwner={false}
        accessLevel={accessLevel}
        onAccessLevelChange={onAccessLevelChange}
        disabled={accessLevel === AccessLevel.Owner}
      />
      <IconButton aria-label="delete" onClick={onShareRemove}>
        <DeleteIcon />
      </IconButton>
    </Box>
  </Stack>
);
