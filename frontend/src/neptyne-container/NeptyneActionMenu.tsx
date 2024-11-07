import {
  Box,
  Fade,
  Icon,
  Link,
  ListItemIcon,
  Menu,
  MenuItem,
  SnackbarOrigin,
  Theme,
  Typography,
} from "@mui/material";
import { NestedMenuItem } from "mui-nested-menu";
import authenticatedFetch from "../authenticatedFetch";
import { OpenTyneDialogDataWrapper } from "../components/OpenDialog/OpenTyneDialogDataWrapper";
import * as React from "react";
import Button from "@mui/material/Button";
import { NameDialog } from "../NameDialog";
import { FileUploadDialog } from "../FileUploadDialog";
import { TyneAction } from "../SheetUtils";
import { ConfirmDialog } from "../ConfirmDialog";
import SecretsModal from "../SecretsModal";
import RequirementsModal from "../RequirementsModal";
import { StreamHandler } from "../KernelSession";
import { hotKeys } from "../hotkeyConstants";
import { NeptyneActionText } from "./NeptyneActionText";
import { ModalReducerAction, useModalDispatch } from "./NeptyneModals";
import { NeptyneSnackbar } from "../components/NeptyneSnackbar";
import { VerticalArrowIcon } from "../components/NeptyneIconButton";
import { ReactComponent as NewTyne } from "../icons/newTyne.svg";
import { ReactComponent as OpenTyne } from "../icons/openTyne.svg";
import { ReactComponent as Import } from "../icons/import.svg";
import { ReactComponent as Save } from "../icons/save.svg";
import { ReactComponent as MakeCopy } from "../icons/makeCopy.svg";
import { ReactComponent as EditSecrets } from "../icons/editSecrets.svg";
import { ReactComponent as EditRequirements } from "../icons/editRequirements.svg";
import { ReactComponent as Interrupt } from "../icons/interrupt.svg";
import { ReactComponent as DeleteTyne } from "../icons/deleteTyne.svg";
import { SecondaryDivider } from "../components/ToolbarControls/TextAlignControl";
import { SystemStyleObject } from "@mui/system";
import { DriveFileRenameOutline, Science } from "@mui/icons-material";
import { GoogleDriveDoc } from "../google-drive";
import { isMobile } from "react-device-detect";
import ShareIcon from "@mui/icons-material/Share";
import ComputerIcon from "@mui/icons-material/Computer";
import { ShareDialogDataWrapper } from "../ShareDialog/ShareDialogDataWrapper";
import { ReadonlyScreen } from "../ReadonlyScreen";
import { AccessMode, Secrets } from "../NeptyneProtocol";
import { useNavigate } from "react-router-dom";
import { useFeatureFlags } from "../feature-flags";
import { useCapabilities } from "../capabilities";
import { useAccessMode } from "../access-mode";
import { getGSheetAppConfig } from "../gsheet_app_config";
import NKSModal from "../NKSModal";
import { User } from "../user-context";

export interface MenuAction {
  label: string;
  onClick: () => void;
}

interface NeptyneActionMenuProps {
  statusIcon: React.ReactNode;
  statusText: string | null;
  tyneId: string;
  readOnly: boolean;
  tyneName: string;
  user: User | null;
  snackErrorMessage: string | null;
  showReadonlyScreen: boolean;
  onTyneAction: (
    tyneAction: TyneAction,
    payload?: string | File | GoogleDriveDoc
  ) => void;
  handleReadonlyScreenClose: () => void;
  onDeleteTyne: () => void;
  onImportCsv: () => void;
  onSave: () => void;
  onDownload: (fmt: string) => void;
  onDismissAlert: () => void;
  onTyneRenameInitialization: () => void;
  showCopyPrompt: boolean;
  canInterrupt: boolean;
  onInterrupt: () => void;
  onOpenResearchPanel: () => void;
  requirements: string;
  onInstallRequirements: (requirements?: string, onStream?: StreamHandler) => void;
  showRequirements: boolean;
  setSecrets: (user: Secrets, tyne: Secrets) => void;
  reconnectKernel: (name: string) => void;
}

const getButtonBaseActiveSX = (theme: Theme): SystemStyleObject => ({
  backgroundColor: theme.palette.secondary.lightBackground,
});

const getButtonBaseSX = (theme: Theme): SystemStyleObject => ({
  backgroundColor: "transparent",
  border: "1px solid transparent",
  height: "35px",
  marginRight: "10px",
  padding: "5px",
  // Creating transformation root to prevent glitches on safari
  transform: "translate3d(0, 0, 0)",
  transitionDuration: theme.transitions.duration.standard + "ms",
  transitionProperty: "background-color, border-color",
  transitionTimingFunction: theme.transitions.easing.easeOut,
  "&:hover": {
    ...getButtonBaseActiveSX(theme),
  },
  "& .MuiButton-startIcon": {
    color: theme.palette.text.primary,
    marginRight: "0px",
  },
  "& .vertical-arrow-icon": {
    color: "text.primary",
  },
});

const getMenuButtonActiveSX = (theme: Theme): SystemStyleObject => ({
  ...getButtonBaseSX(theme),
  ...getButtonBaseActiveSX(theme),
  borderColor: theme.palette.secondary.lightBorder,
});

const MENU_BUTTON_STATUS_SX = {
  top: "100%",
  left: "50%",
  transform: "translateX(-50%)",
  position: "absolute",
  whiteSpace: "nowrap",
};

const NEPTYNE_BUTTON_STYLE_PROPS: Partial<React.ComponentProps<typeof Menu>> = {
  anchorOrigin: {
    vertical: "bottom",
    horizontal: "left",
  },
  transformOrigin: {
    vertical: "top",
    horizontal: "left",
  },
  sx: (theme) => ({
    "& .MuiPaper-root": {
      backgroundColor: theme.palette.secondary.lightBackground,
      border: `1px solid ${theme.palette.secondary.selectedButtonBorder}`,
      borderRadius: "3px",
      padding: "3px 0",
      marginTop: "8px",
      marginLeft: "-5px",
      "& .MuiList-root": {
        padding: "4px",
      },
      "& .MuiDivider-root": {
        marginLeft: "8px",
        marginRight: "8px",
        width: "auto",
      },
      "& .MuiMenuItem-root": {
        ...theme.typography.body1,
        padding: "5px",
        margin: "0px 3px 5px 3px",
        borderRadius: "3px",
        display: "flex",
        textAlign: "left",
        height: "22px",
        verticalAlign: "middle",
        "&:hover": {
          backgroundColor: "secondary.hover",
        },
        "& .MuiListItemIcon-root": {
          minWidth: "0px",
          marginRight: "6px",
          "& .MuiIcon-root": {
            width: "16px",
            height: "16px",
          },
        },
        "& .MuiListItemText-primary": {
          ...theme.typography.body1,
        },
        "& .MuiListItemText-secondary": {
          ...theme.typography.body2,
          color: "text.primary",
        },
      },
    },
  }),
};

interface ImportDialogState {
  open: boolean;
  prompt?: string;
  fileMask?: string;
}

export const NeptyneActionMenu = ({
  statusIcon,
  statusText,
  tyneId,
  readOnly,
  user,
  onTyneAction,
  tyneName,
  showCopyPrompt,
  snackErrorMessage,
  showReadonlyScreen,
  handleReadonlyScreenClose,
  onSave,
  onDownload,
  onImportCsv,
  onDismissAlert,
  onDeleteTyne,
  onTyneRenameInitialization,
  canInterrupt,
  onInterrupt,
  onOpenResearchPanel,
  requirements,
  onInstallRequirements,
  showRequirements,
  setSecrets,
  reconnectKernel,
}: NeptyneActionMenuProps) => {
  const modalDispatch = useModalDispatch();
  const navigate = useNavigate();
  const featureFlags = useFeatureFlags();
  const capabilities = useCapabilities();
  const accessMode = useAccessMode();

  const [menuAnchorEl, setMenuAnchorEl] = React.useState<HTMLElement | null>(null);
  const [copyDialogOpen, setCopyDialogOpen] = React.useState(false);
  const [importDialogOpen, setImportDialogOpen] = React.useState<ImportDialogState>({
    open: false,
  });

  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [secretDialogOpen, setSecretDialogOpen] = React.useState(false);
  const [requirementsDialogOpen, setRequirementsDialogOpen] = React.useState(false);
  const [nksDialogOpen, setNKSDialogOpen] = React.useState(false);
  const [userSecrets, setUserSecrets] = React.useState<{
    [key: string]: string;
  } | null>(null);
  const [tyneSecrets, setTyneSecrets] = React.useState<{
    [key: string]: string;
  } | null>(null);

  const handleClose = React.useCallback(() => {
    setMenuAnchorEl(null);
  }, []);

  const handleMenuOpen = React.useCallback((event: any) => {
    setMenuAnchorEl(event.currentTarget);
  }, []);

  const handleNewTyne = React.useCallback(() => {
    handleClose();
    onTyneAction(TyneAction.New);
  }, [handleClose, onTyneAction]);

  const handleOpenTyne = React.useCallback(() => {
    handleClose();
    modalDispatch({
      action: ModalReducerAction.Show,
      props: {
        element: OpenTyneDialogDataWrapper,
      },
    });
  }, [handleClose, modalDispatch]);

  const handleImportTyne = React.useCallback(
    (prompt: string, fileMask: string) => {
      handleClose();
      setImportDialogOpen({ open: true, prompt, fileMask });
    },
    [handleClose]
  );

  const handleImportCsv = React.useCallback(() => {
    handleClose();
    onImportCsv();
  }, [handleClose, onImportCsv]);

  const handleSaveTyne = React.useCallback(() => {
    handleClose();
    onSave();
  }, [handleClose, onSave]);

  const handleDownloadTyneXlsx = React.useCallback(() => {
    handleClose();
    onDownload("xlsx");
  }, [handleClose, onDownload]);

  const handleDownloadTyneJson = React.useCallback(() => {
    handleClose();
    onDownload("json");
  }, [handleClose, onDownload]);

  const handleDownloadTyneCsv = React.useCallback(() => {
    handleClose();
    onDownload("csv");
  }, [handleClose, onDownload]);

  const handleCopyTyne = React.useCallback(() => {
    handleClose();
    setCopyDialogOpen(true);
  }, [handleClose]);

  const handleEditSecrets = React.useCallback(() => {
    handleClose();
    setSecretDialogOpen(true);
    const url = "/api/tynes/" + tyneId + "/secrets";
    authenticatedFetch(user!, url).then((response) => {
      response.json().then((secrets) => {
        setUserSecrets(secrets.user);
        setTyneSecrets(secrets.tyne);
      });
    });
  }, [handleClose, tyneId, user]);

  const handleEditRequirements = React.useCallback(() => {
    handleClose();
    setRequirementsDialogOpen(true);
  }, [handleClose]);

  const onShowNKSPopup = React.useCallback(() => {
    handleClose();
    setNKSDialogOpen(true);
  }, [handleClose]);

  const handleInterrupt = React.useCallback(() => {
    handleClose();
    onInterrupt();
  }, [handleClose, onInterrupt]);

  const handleOpenResearchPanel = React.useCallback(() => {
    handleClose();
    onOpenResearchPanel();
  }, [handleClose, onOpenResearchPanel]);

  const handleDeleteTyne = React.useCallback(() => {
    handleClose();
    setDeleteDialogOpen(true);
  }, [handleClose]);

  const handleTyneRename = React.useCallback(
    (event: React.MouseEvent<HTMLLIElement>) => {
      event.preventDefault();
      handleClose();
      // MUI changes focus to the button on menu close,
      // which causes race condition with our edit logic.
      // To prevent that, we use this timeout.
      // In general, it would be better to have setState callback for handleClose,
      // but react hooks doesn't provide such option by default which makes it a little dirtier.
      setTimeout(onTyneRenameInitialization, 50);
    },
    [onTyneRenameInitialization, handleClose]
  );

  let dialogToShow = null;
  if (showReadonlyScreen) {
    dialogToShow = (
      <ReadonlyScreen
        open={showReadonlyScreen}
        onClose={(action) => {
          if (action === "close") {
            // do nothing
          } else if (action === "copy") {
            setCopyDialogOpen(true);
          } else if (action === "login") {
            navigate("/-/#login;" + tyneId);
          } else if (action === "signup") {
            navigate("/-/#signup;" + tyneId);
          }
          handleReadonlyScreenClose();
        }}
        loggedIn={!!user}
      />
    );
  } else if (copyDialogOpen) {
    dialogToShow = (
      <NameDialog
        open={copyDialogOpen}
        value={tyneName + " (copy)"}
        onClose={(nameForCopy) => {
          if (nameForCopy !== null) {
            onTyneAction(TyneAction.Copy, nameForCopy);
          }
          setCopyDialogOpen(false);
        }}
        title="Copy Tyne"
        prompt="Enter the name for the new Tyne"
      />
    );
  } else if (importDialogOpen.open) {
    dialogToShow = (
      <FileUploadDialog
        onClose={(fileName) => {
          if (fileName) {
            onTyneAction(TyneAction.Import, fileName);
          }
          setImportDialogOpen({ open: false });
        }}
        open={true}
        prompt={importDialogOpen.prompt || "Import a file"}
        accept={importDialogOpen.fileMask || "*.*"}
        title="Import a file"
      />
    );
  } else if (deleteDialogOpen) {
    dialogToShow = (
      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={(confirm) => {
          if (confirm) {
            onDeleteTyne();
          }
          setDeleteDialogOpen(false);
        }}
        title="Delete Tyne"
        prompt="Are you sure you want to delete this Tyne? This action cannot be undone"
      />
    );
  } else if (secretDialogOpen) {
    dialogToShow = (
      <SecretsModal
        open={secretDialogOpen}
        userSecrets={userSecrets}
        tyneSecrets={tyneSecrets}
        onClose={(userSecrets, tyneSecrets) => {
          setSecretDialogOpen(false);
          if (tyneSecrets !== null && userSecrets !== null) {
            setSecrets(userSecrets, tyneSecrets);
          }
        }}
      />
    );
  } else if (showRequirements || requirementsDialogOpen) {
    dialogToShow = (
      <RequirementsModal
        open={showRequirements || requirementsDialogOpen}
        onClose={() => {
          onInstallRequirements();
          if (getGSheetAppConfig().inGSMode) {
            google.script.host.close();
          } else {
            setRequirementsDialogOpen(false);
          }
        }}
        onRun={(reqs, onStream) => onInstallRequirements(reqs, onStream)}
        requirements={requirements}
      />
    );
  } else if (nksDialogOpen && user !== null) {
    dialogToShow = (
      <NKSModal
        open={nksDialogOpen}
        onClose={() => {
          setNKSDialogOpen(false);
        }}
        connectToKernel={reconnectKernel}
      />
    );
  }

  const readonlySnackContents = (
    <>
      This Tyne is read-only. To run or edit,{" "}
      <Link
        // This should use component="button", but the text doesn't render
        // properly that way.
        href="#"
        onClick={() => {
          setCopyDialogOpen(true);
        }}
      >
        make a copy.
      </Link>
    </>
  );

  const tryingNeptyneContents = (
    <>
      You are trying Neptyne. To avoid losing your work when you close the browser{" "}
      <Link href={"/-/#signup;" + tyneId}>Sign up</Link>
    </>
  );

  const anonymousPrompt =
    !!user?.isAnonymous && !window.location.hash.startsWith("#signup");
  const showSnackbar =
    (snackErrorMessage != null || showCopyPrompt || anonymousPrompt) &&
    dialogToShow === null &&
    user != null;

  let content: string | JSX.Element | undefined;
  let anchorOrigin: SnackbarOrigin | undefined;
  if (snackErrorMessage !== null) {
    content = snackErrorMessage;
  } else if (showCopyPrompt) {
    content = readonlySnackContents;
  } else {
    content = tryingNeptyneContents;
    anchorOrigin = {
      vertical: "bottom",
      horizontal: "center",
    };
  }
  const snackbar = (
    <NeptyneSnackbar
      isOpen={showSnackbar}
      content={content}
      severity={snackErrorMessage ? "error" : "info"}
      onClick={onDismissAlert}
      closeAllowed={snackErrorMessage !== null}
      anchorOrigin={anchorOrigin}
    />
  );

  const dispatchModal = useModalDispatch();
  const handleShareButtonClick = React.useCallback(
    () =>
      dispatchModal({
        action: ModalReducerAction.Show,
        props: { element: ShareDialogDataWrapper },
      }),
    [dispatchModal]
  );

  const onClickUpgrade = React.useCallback(
    () => window.location.assign("/--/subscription"),
    []
  );

  return (
    <>
      {user && !user?.isAnonymous && (
        <>
          <Box position="relative">
            <Button
              variant="contained"
              size="small"
              startIcon={statusIcon}
              endIcon={<VerticalArrowIcon isActive={!!menuAnchorEl} />}
              onClick={handleMenuOpen}
              sx={menuAnchorEl ? getMenuButtonActiveSX : getButtonBaseSX}
              data-testid={"action-menu-open-button"}
            />
            <Fade easing="ease-out" in={Boolean(statusText)} mountOnEnter unmountOnExit>
              <Typography color="black" fontSize={8} sx={MENU_BUTTON_STATUS_SX}>
                {statusText}
              </Typography>
            </Fade>
          </Box>
          {!!menuAnchorEl && (
            <Menu
              id="menu-appbar"
              anchorEl={menuAnchorEl}
              keepMounted
              open={!!menuAnchorEl}
              onClose={handleClose}
              {...NEPTYNE_BUTTON_STYLE_PROPS}
            >
              <MenuItem onClick={handleNewTyne}>
                <ListItemIcon>
                  <Icon component={NewTyne} />
                </ListItemIcon>
                <NeptyneActionText hotKey={hotKeys.createNewTyne}>
                  New
                </NeptyneActionText>
              </MenuItem>
              <MenuItem onClick={handleOpenTyne}>
                <ListItemIcon>
                  <Icon component={OpenTyne} />
                </ListItemIcon>
                <NeptyneActionText hotKey={hotKeys.openTyne}>Open</NeptyneActionText>
              </MenuItem>
              <NestedMenuItem
                label="Import"
                parentMenuOpen={!!menuAnchorEl}
                data-testid={"action-menu-import-tyne"}
                leftIcon={
                  <ListItemIcon>
                    <Icon component={Import} />
                  </ListItemIcon>
                }
              >
                <MenuItem
                  onClick={() =>
                    handleImportTyne("Import an Excel file (xlsx)", ".xlsx")
                  }
                >
                  <ListItemIcon>
                    <Icon component={Import} />
                  </ListItemIcon>
                  <NeptyneActionText>Excel</NeptyneActionText>
                </MenuItem>
                <MenuItem
                  onClick={() => handleImportTyne("Import a Neptyne file", ".json")}
                >
                  <ListItemIcon>
                    <Icon component={Import} />
                  </ListItemIcon>
                  <NeptyneActionText>Tyne File</NeptyneActionText>
                </MenuItem>
                <MenuItem
                  onClick={() =>
                    handleImportTyne("Import a Jupyter notebook (ipynb)", ".ipynb")
                  }
                >
                  <ListItemIcon>
                    <Icon component={Import} />
                  </ListItemIcon>
                  <NeptyneActionText>Jupyter Notebook</NeptyneActionText>
                </MenuItem>
                <MenuItem
                  disabled={readOnly}
                  onClick={handleImportCsv}
                  data-testid={"action-menu-import-tyne-csv"}
                >
                  <ListItemIcon>
                    <Icon component={Import} />
                  </ListItemIcon>
                  <NeptyneActionText>Append CSV</NeptyneActionText>
                </MenuItem>
              </NestedMenuItem>
              <NestedMenuItem
                label="Export"
                parentMenuOpen={!!menuAnchorEl}
                data-testid={"action-menu-export-tyne"}
                leftIcon={
                  <ListItemIcon>
                    <Icon component={Save} />
                  </ListItemIcon>
                }
              >
                <MenuItem disabled={readOnly} onClick={handleDownloadTyneXlsx}>
                  <ListItemIcon>
                    <Icon component={Save} />
                  </ListItemIcon>
                  <NeptyneActionText>Excel</NeptyneActionText>
                </MenuItem>
                <MenuItem disabled={readOnly} onClick={handleDownloadTyneJson}>
                  <ListItemIcon>
                    <Icon component={Save} />
                  </ListItemIcon>
                  <NeptyneActionText>Tyne File</NeptyneActionText>
                </MenuItem>
                <MenuItem
                  disabled={readOnly}
                  onClick={handleDownloadTyneCsv}
                  data-testid={"action-menu-export-tyne-csv"}
                >
                  <ListItemIcon>
                    <Icon component={Save} />
                  </ListItemIcon>
                  <NeptyneActionText>Current sheet as CSV</NeptyneActionText>
                </MenuItem>
              </NestedMenuItem>
              <MenuItem disabled={readOnly} onClick={handleSaveTyne}>
                <ListItemIcon>
                  <Icon component={Save} />
                </ListItemIcon>
                <NeptyneActionText>Save</NeptyneActionText>
              </MenuItem>
              <MenuItem onClick={handleCopyTyne} data-testid={"action-menu-make-copy"}>
                <ListItemIcon>
                  <Icon component={MakeCopy} />
                </ListItemIcon>
                <NeptyneActionText>Make a copy</NeptyneActionText>
              </MenuItem>
              <MenuItem
                onClick={handleEditSecrets}
                data-testid={"action-menu-edit-secrets"}
              >
                <ListItemIcon>
                  <Icon component={EditSecrets} />
                </ListItemIcon>
                <NeptyneActionText>Edit Secrets</NeptyneActionText>
              </MenuItem>
              <MenuItem onClick={handleEditRequirements} disabled={readOnly}>
                <ListItemIcon>
                  <Icon component={EditRequirements} />
                </ListItemIcon>
                <NeptyneActionText>Install Packages</NeptyneActionText>
              </MenuItem>
              {capabilities.canUseNKS && (
                <MenuItem onClick={onShowNKSPopup}>
                  <ListItemIcon>
                    <Icon component={ComputerIcon} />
                  </ListItemIcon>
                  <NeptyneActionText>Connect Local Kernels</NeptyneActionText>
                </MenuItem>
              )}
              {isMobile && (
                <MenuItem onClick={handleShareButtonClick}>
                  <ListItemIcon>
                    <Icon component={ShareIcon} />
                  </ListItemIcon>
                  <NeptyneActionText>Share</NeptyneActionText>
                </MenuItem>
              )}
              <SecondaryDivider orientation="horizontal" />
              <MenuItem disabled={!canInterrupt} onClick={handleInterrupt}>
                <ListItemIcon>
                  <Icon component={Interrupt} />
                </ListItemIcon>
                <NeptyneActionText>Interrupt</NeptyneActionText>
              </MenuItem>
              {featureFlags.isFeatureEnabled("ai-side-panel") && (
                <>
                  <SecondaryDivider orientation="horizontal" />
                  <MenuItem onClick={handleOpenResearchPanel}>
                    <ListItemIcon>
                      <Icon component={Science} />
                    </ListItemIcon>
                    <NeptyneActionText>AI Research</NeptyneActionText>
                  </MenuItem>
                </>
              )}
              <SecondaryDivider orientation="horizontal" />
              <MenuItem
                disabled={
                  accessMode !== AccessMode.Edit && accessMode !== AccessMode.App
                }
                onClick={handleDeleteTyne}
              >
                <ListItemIcon>
                  <Icon component={DeleteTyne} />
                </ListItemIcon>
                <NeptyneActionText>Delete this Tyne</NeptyneActionText>
              </MenuItem>
              <SecondaryDivider orientation="horizontal" />
              <MenuItem disabled={readOnly} onMouseDown={handleTyneRename}>
                <ListItemIcon>
                  <DriveFileRenameOutline fontSize="small" />
                </ListItemIcon>
                <NeptyneActionText>Rename</NeptyneActionText>
              </MenuItem>
            </Menu>
          )}
        </>
      )}
      {showSnackbar && snackbar}
      {dialogToShow}
    </>
  );
};
