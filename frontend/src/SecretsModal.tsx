import _ from "lodash";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import DeleteIcon from "@mui/icons-material/Delete";
import AddCircleIcon from "@mui/icons-material/AddCircle";
import {
  DataGrid,
  GridActionsCellItem,
  GridCellEditCommitParams,
  GridColumns,
  GridPreProcessEditCellProps,
} from "@mui/x-data-grid";
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Box, Grid, IconButton, Stack } from "@mui/material";
import DialogContentText from "@mui/material/DialogContentText";

import { NeptyneDialog } from "./NeptyneDialog";
import { Secrets } from "./NeptyneProtocol";
import authenticatedFetch from "./authenticatedFetch";
import { User } from "./user-context";

type Record = { id: string; key: string; value: string };

interface Props {
  open: boolean | "fullScreen";
  userSecrets: Secrets | null;
  tyneSecrets: Secrets | null;
  onClose: (userSecret: Secrets | null, tyneSecret: Secrets | null) => void;
}

const COMMON_PROPS = {
  editable: true,
  hideable: false,
  sortable: false,
  groupable: false,
  pinnable: false,
  filterable: false,
  disableColumnMenu: true,
  disableReorder: true,
};

const Footer = ({ children }: { children: ReactNode }) => {
  return (
    <Grid container justifyContent="flex-end">
      {children}
    </Grid>
  );
};

const SecretsModal = (props: Props) => {
  const {
    open,
    userSecrets: initialUserSecrets,
    tyneSecrets: initialTyneSecrets,
    onClose,
  } = props;
  let [userSecrets, setUserSecrets] = useState<Record[] | null>(null);
  let [tyneSecrets, setTyneSecrets] = useState<Record[] | null>(null);

  const showUserSecrets = initialUserSecrets !== null;

  const initialUserSecretRecords: Record[] = useMemo(
    () =>
      _.entries(initialUserSecrets || {}).map(([key, value]) => ({
        id: _.uniqueId(),
        key,
        value,
      })),
    [initialUserSecrets]
  );

  const initialTyneSecretRecords: Record[] = useMemo(
    () =>
      _.entries(initialTyneSecrets || {}).map(([key, value]) => ({
        id: _.uniqueId(),
        key,
        value,
      })),
    [initialTyneSecrets]
  );

  if (userSecrets === null) {
    userSecrets = initialUserSecretRecords;
  }
  if (tyneSecrets === null) {
    tyneSecrets = initialTyneSecretRecords;
  }

  const modifySecrets = useCallback(
    (modifier: (s: { [key: string]: Record }) => void, modifyUserSecret: boolean) => {
      const prevSecrets = modifyUserSecret
        ? userSecrets || initialUserSecretRecords || []
        : tyneSecrets || initialTyneSecretRecords || [];
      const map = _.keyBy(prevSecrets, "id");
      modifier(map);
      (modifyUserSecret ? setUserSecrets : setTyneSecrets)(_.values(map));
    },
    [initialTyneSecretRecords, initialUserSecretRecords, tyneSecrets, userSecrets]
  );

  const handleCancel = useCallback(() => {
    onClose(null, null);
  }, [onClose]);

  const handleSave = useCallback(() => {
    // firing asynchronously allows the edits to commit first...
    setTimeout(() => {
      const mapSecrets = (s: Record[]) => _.fromPairs(s.map((r) => [r.key, r.value]));
      onClose(mapSecrets(userSecrets || []), mapSecrets(tyneSecrets || []));
    });
  }, [onClose, tyneSecrets, userSecrets]);

  const handleNew = useCallback(
    (isUserSecret: boolean) =>
      modifySecrets((map) => {
        let name: string;
        const names = new Set(_.values(map).map((r) => r.key));
        for (let i = 0; true; i++) {
          const tag = isUserSecret ? "user" : "tyne";
          name = `New ${tag} secret ${i}`;
          if (!names.has(name)) {
            break;
          }
        }
        const id = _.uniqueId();
        map[id] = { key: name, value: "", id };
      }, isUserSecret),
    [modifySecrets]
  );

  const handleEdit = useCallback(
    ({ id, field, value }: GridCellEditCommitParams, isUserSecret: boolean) => {
      modifySecrets((map) => {
        if (field === "value") {
          map[id as string].value = value as string;
        } else if (field === "key") {
          map[id as string].key = value as string;
        }
      }, isUserSecret);
    },
    [modifySecrets]
  );

  const handleDelete = useCallback(
    (idToDelete: string, isUserSecret: boolean) => {
      modifySecrets((map) => delete map[idToDelete], isUserSecret);
    },
    [modifySecrets]
  );

  function secretsGrid(secrets: Record[], isUserSecret: boolean) {
    const columns: GridColumns = [
      {
        ...COMMON_PROPS,
        field: "key",
        type: "string",
        headerName: isUserSecret ? "User secret" : "Tyne secret",
        minWidth: 100,
        flex: 1,
        preProcessEditCellProps: (params: GridPreProcessEditCellProps) => {
          const {
            props: { value },
          } = params;
          const empty = (value as string).length === 0;
          return { ...params.props, error: empty };
        },
      },
      {
        ...COMMON_PROPS,
        field: "value",
        type: "string",
        headerName: "Value",
        minWidth: 100,
        flex: 1,
        valueFormatter: ({ id, value }) => {
          if (id === "") {
            return value;
          }
          const strValue = value as string;
          const truncateAt = Math.min(Math.floor(strValue.length / 2), 4);
          return `${strValue.slice(0, truncateAt)}******`;
        },
      },
      {
        ...COMMON_PROPS,
        field: "actions",
        type: "actions",
        width: 25,
        getActions: (params) => {
          return [
            <GridActionsCellItem
              label="Delete"
              icon={<DeleteIcon />}
              onClick={() => handleDelete(params.id as string, isUserSecret)}
            />,
          ];
        },
      },
    ];
    return (
      <Box
        sx={{
          display: "flex",
          flexGrow: 1,
          minWidth: 500,
          "& .Mui-error": {
            bgcolor: (theme) => `rgb(126,10,15, 0.1)`,
            color: "#750f0f",
          },
        }}
      >
        <DataGrid
          rows={secrets}
          columns={columns}
          rowHeight={30}
          onCellEditCommit={(params) => handleEdit(params, isUserSecret)}
          sx={{
            ".MuiDataGrid-columnSeparator": {
              display: "none",
            },
          }}
          components={{
            Footer,
          }}
          componentsProps={{
            footer: {
              children: (
                <IconButton
                  onClick={() => handleNew(isUserSecret)}
                  data-testid={"add-secret-" + (isUserSecret ? "user" : "tyne")}
                >
                  <AddCircleIcon />
                </IconButton>
              ),
            },
          }}
        />
      </Box>
    );
  }

  if (initialTyneSecrets === null) {
    return null;
  }

  return (
    <NeptyneDialog
      open={!!open}
      onClose={handleCancel}
      fullScreen={open === "fullScreen"}
    >
      {open !== "fullScreen" && <DialogTitle>Tyne Secrets</DialogTitle>}
      <DialogContent>
        <Stack height={open === "fullScreen" ? "100%" : 600}>
          <DialogContentText>
            Secrets are available in code using{" "}
            <pre>
              import neptyne as nt
              <br />
              nt.get_secret("&lt;secret key&gt;")
            </pre>
            {showUserSecrets && (
              <>
                There are two types of secrets: user secrets and tyne secrets. User
                secrets are only accessible to a specific user and in this form you can
                only see your own.
                <br />
                Tyne secrets are secrets accessible by anybody who has edit access to
                the Tyne. Make sure you trust the people with edit access before
                entering a tyne secret!
              </>
            )}
          </DialogContentText>
          {showUserSecrets && secretsGrid(userSecrets, true)}
          {secretsGrid(tyneSecrets, false)}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleSave} data-testid={"save-button"}>
          Save
        </Button>
        <Button onClick={handleCancel}>Cancel</Button>
      </DialogActions>
    </NeptyneDialog>
  );
};

interface GSheetSecretsModalProps {
  user: User;
  tyneId: string;
  onClose: (secrets: Secrets | null) => void;
}

const GSheetSecretsModal = (props: GSheetSecretsModalProps) => {
  const { user, tyneId, onClose } = props;

  const [secrets, setSecrets] = useState<Secrets | null>(null);

  useEffect(() => {
    if (tyneId !== "") {
      const url = "/api/tynes/" + tyneId + "/secrets";
      authenticatedFetch(user!, url).then((response) => {
        response.json().then((secrets) => {
          setSecrets(secrets.tyne);
        });
      });
    }
  }, [user, tyneId]);

  if (secrets === null) {
    return null;
  }

  return (
    <SecretsModal
      open="fullScreen"
      userSecrets={null}
      tyneSecrets={secrets}
      onClose={(_userSecrets, tyneSecrets) => onClose(tyneSecrets)}
    />
  );
};

export { GSheetSecretsModal };

export default SecretsModal;
