import { getGSheetAppConfig } from "./gsheet_app_config";
import { useCallback, useEffect, useState } from "react";
import {
  Backdrop,
  Box,
  CircularProgress,
  IconButton,
  styled,
  Tooltip,
  tooltipClasses,
  TooltipProps,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import {
  DataGrid,
  GridColDef,
  GridEditInputCell,
  GridPreProcessEditCellProps,
  GridRenderEditCellParams,
  GridToolbarContainer,
} from "@mui/x-data-grid";
import Button from "@mui/material/Button";
import AddIcon from "@mui/icons-material/Add";
import authenticatedFetch from "./authenticatedFetch";
import { User } from "./user-context";

interface Props {
  user: User | null;
}

const nextId = (obj: Record<string, any>) =>
  Math.max(...Object.keys(obj).map((s) => parseInt(s, 10))) + 1;

const StyledBox = styled(Box)(({ theme }) => ({
  "& .MuiDataGrid-columnSeparator": {
    display: "none",
  },
  "& .MuiDataGrid-cell--editing": {
    "& .MuiInputBase-root": {
      height: "100%",
    },
  },
  "& .Mui-error": {
    backgroundColor: `rgb(126,10,15,0.1)`,
    color: "#750f0f",
  },
}));

const StyledTooltip = styled(({ className, ...props }: TooltipProps) => (
  <Tooltip {...props} classes={{ popper: className }} />
))(({ theme }) => ({
  [`& .${tooltipClasses.tooltip}`]: {
    backgroundColor: theme.palette.error.main,
    color: theme.palette.error.contrastText,
  },
}));

const validateKey = (key: string) => {
  if (key.length === 0) {
    return "Cannot be empty";
  }
  if (/^\d/.test(key)) {
    return "Cannot start with a number";
  }
  if (!/^[a-zA-Z]+[a-zA-Z0-9_]*$/.test(key)) {
    return "Only letters, numbers and _ allowed";
  }
};

const EnvironmentVariables = (props: Props) => {
  const { authToken } = getGSheetAppConfig();
  const { user } = props;

  const [environmentVariables, setEnvironmentVariables] = useState<Record<
    string,
    [string, string]
  > | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }
    authenticatedFetch(user, `/api/tynes/gsheet/environment`)
      .then((res) => res.json())
      .then((data: Record<string, string>) =>
        setEnvironmentVariables(
          Object.entries(data).reduce((acc, [key, value], ix) => {
            acc[ix] = [key, value];
            return acc;
          }, {} as Record<string, [string, string]>)
        )
      );
  }, [user]);

  const updateServer = useCallback(
    (environmentVariables: Record<string, [string, string]>) => {
      if (!user) {
        return;
      }
      authenticatedFetch(user, `/api/tynes/gsheet/environment`, {
        method: "PUT",
        body: JSON.stringify(
          Object.values(environmentVariables).reduce((acc, [k, v]) => {
            acc[k] = v;
            return acc;
          }, {} as Record<string, string>)
        ),
      });
    },
    [user]
  );

  const handleDelete = useCallback(
    (id: string) => {
      setEnvironmentVariables((prev) => {
        const next = { ...prev };
        delete next[id];
        updateServer(next);
        return next;
      });
    },
    [updateServer]
  );

  const handleAdd = useCallback(() => {
    setEnvironmentVariables((prev) => {
      const next = { ...prev };
      const nextIx = nextId(next).toString();
      next[nextIx] = ["", ""];
      return next;
    });
  }, []);

  const handleEdit = useCallback(
    (id: string, key: string, value: string) => {
      setEnvironmentVariables((prev) => {
        const next = { ...prev };
        next[id] = [key, value];
        updateServer(next);
        return next;
      });
    },
    [updateServer]
  );

  const processRowUpdate = useCallback(
    (newRow: any, originalRow: any) => {
      const { id, key, value } = newRow;
      handleEdit(id, key, value);
      return newRow;
    },
    [handleEdit]
  );

  if (!authToken) {
    console.error("Missing required gsheet app config");
    return null;
  }

  const commonColProps: Partial<GridColDef> = {
    headerClassName: "simple-grid-header",
    hideable: false,
    sortable: false,
    resizable: false,
    editable: true,
    filterable: false,
    disableColumnMenu: true,
    disableReorder: true,
    flex: 1,
  };

  const columns: GridColDef[] = [
    {
      field: "key",
      headerName: "Key",
      ...commonColProps,
      preProcessEditCellProps: (params: GridPreProcessEditCellProps) => {
        const {
          props: { value },
        } = params;
        const error = validateKey(value);
        return { ...params.props, error };
      },
      renderEditCell: EditKey,
    },
    {
      field: "value",
      headerName: "Value",
      valueFormatter: ({ value }) => {
        const truncateAt = Math.min(Math.floor(value.length / 2), 4);
        return `${value.slice(0, truncateAt)}******`;
      },
      ...commonColProps,
    },
    {
      field: "actions",
      headerName: "",
      renderCell: (params) => {
        return (
          <IconButton
            aria-label="delete"
            onClick={() => handleDelete(params.id.toString())}
          >
            <DeleteIcon />
          </IconButton>
        );
      },
      ...commonColProps,
      flex: undefined,
      width: 20,
      editable: false,
    },
  ];

  if (!environmentVariables) {
    return (
      <Backdrop
        sx={{ color: "#fff", zIndex: (theme) => theme.zIndex.drawer + 1 }}
        open={true}
      >
        <CircularProgress color="inherit" />
      </Backdrop>
    );
  }

  const rows = Object.entries(environmentVariables).map(([id, [key, value]]) => ({
    id,
    key,
    value,
  }));

  return (
    <StyledBox height="480px">
      <DataGrid
        experimentalFeatures={{ newEditingApi: true }}
        rows={rows}
        columns={columns}
        hideFooter={true}
        processRowUpdate={processRowUpdate}
        onProcessRowUpdateError={(error) => console.error(error)}
        editMode="row"
        components={{
          Toolbar: AddNewToolbar,
        }}
        componentsProps={{
          toolbar: { handleClickAdd: handleAdd },
        }}
      />
    </StyledBox>
  );
};

interface EditToolbarProps {
  handleClickAdd: () => void;
}

const AddNewToolbar = (props: EditToolbarProps) => {
  const { handleClickAdd } = props;

  return (
    <GridToolbarContainer>
      <Button color="primary" startIcon={<AddIcon />} onClick={handleClickAdd}>
        Add New Environment Variable
      </Button>
    </GridToolbarContainer>
  );
};

const EditKey = (props: GridRenderEditCellParams) => {
  const { error, ...rest } = props;

  return (
    <Box height="100%" width="100%">
      <Box height="100%">
        <GridEditInputCell {...rest} error={!!error} />
      </Box>
      <StyledTooltip
        open={!!error}
        title={error}
        slotProps={{
          popper: {
            sx: {
              [`&.${tooltipClasses.popper}[data-popper-placement*="bottom"] .${tooltipClasses.tooltip}`]:
                {
                  marginTop: "0px",
                },
            },
          },
        }}
      >
        <div />
      </StyledTooltip>
    </Box>
  );
};

export default EnvironmentVariables;
