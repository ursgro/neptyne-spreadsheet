import React, { FunctionComponent, useCallback, useMemo } from "react";
import Button from "@mui/material/Button";
import DialogContent from "@mui/material/DialogContent";

import DialogTitle from "@mui/material/DialogTitle";
import {
  Alert,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { NeptyneDialog } from "../../NeptyneDialog";
import { TyneCategories, TyneListItem } from "../../NeptyneProtocol";
import { OpenDialogDataViewer } from "./OpenDialogDataViewer";
import { useDebounceCallback } from "@react-hook/debounce";

export interface OpenDialogProps {
  open: boolean;
  errorMessage: string | null;
  notificationMessage: string | null;
  tynes: TyneListItem[];
  galleryOnly: boolean;
  activeTyneTab: OpenTyneTab;
  tyneTabCounters: Record<OpenTyneTab, number>;
  onTabChange: (tabName: OpenTyneTab) => void;
  onClose: (fileName?: string) => void;
  onSearch: (searchQuery: string) => void;
  preventClose?: boolean;
}

export type OpenTyneTab = "Authored by me" | "Shared with me" | "Gallery";
export const OPEN_TYNE_TAB_CATEGORIES: Record<OpenTyneTab, TyneCategories> = {
  "Authored by me": TyneCategories.AuthoredByMe,
  "Shared with me": TyneCategories.SharedWithMe,
  Gallery: TyneCategories.InGallery,
};
export const OPEN_TYNE_TABS: OpenTyneTab[] = [
  "Authored by me",
  "Shared with me",
  "Gallery",
];

const SEARCH_INPUT_PROPS = {
  disableUnderline: true,
};

const CLOSE_DIALOG_STYLES = { float: "right" };

const ALERT_STYLES = { marginBottom: "10px" };

const SEARCH_STYLES = (isGalleryOnly: boolean) => ({
  margin: 0,
  display: "contents",
  "& .MuiFilledInput-root": {
    borderRadius: "5px",
    height: "46px",
    width: isGalleryOnly ? "668px" : "518px",
  },
});

const OPEN_DIALOG_BUTTON_STYLES = {
  textTransform: "none",
  height: "46px",
  width: "130px",
};

const SELECTED_LIST_ITEM_TEXT_STYLES = { fontWeight: 700 };
const LIST_ITEM_TEXT_STYLES = { color: "grey.700", fontWeight: 500 };

const LIST_ITEM_STYLES = {
  "&.Mui-selected": {
    backgroundColor: "transparent",
    color: "secondary.main",
    "&:hover": {
      backgroundColor: "secondary.lightBackground",
    },
  },
};

const LIST_STYLES = { paddingTop: 0 };

const DIALOG_TITLE_STYLES = {
  fontWeight: 700,
  color: "grey.800",
  fontSize: "1.5rem",
};

export const OpenDialog = ({
  open,
  tynes,
  errorMessage,
  notificationMessage,
  activeTyneTab,
  tyneTabCounters,
  galleryOnly,
  onTabChange,
  onClose,
  onSearch,
  preventClose,
}: OpenDialogProps) => {
  const [selectedTyneId, setSelectedTyneId] = React.useState<string>();

  const handleCancel = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleAccept = useCallback(() => {
    if (selectedTyneId) {
      onClose(selectedTyneId);
    } else {
      handleCancel();
    }
  }, [onClose, handleCancel, selectedTyneId]);

  const handleCreateNew = useCallback(() => {
    onClose("_new");
  }, [onClose]);

  const handleSearch = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onSearch(e.target.value),
    [onSearch]
  );

  const handleDebouncedSearch = useDebounceCallback(handleSearch, 20);

  const dialogLabel = "open-dialog-title";

  const actionDescription = activeTyneTab === "Gallery" ? "Use template" : "Open Tyne";

  return (
    <NeptyneDialog
      scroll="body"
      open={open}
      onClose={handleCancel}
      onConfirm={handleAccept}
      ariaLabel={dialogLabel}
      maxWidth="xl"
      preventClose={!!preventClose}
    >
      <DialogTitle id={dialogLabel} sx={DIALOG_TITLE_STYLES}>
        {galleryOnly ? "Example Tynes" : "Open Tyne"}
        {!preventClose && (
          <IconButton
            sx={CLOSE_DIALOG_STYLES}
            onClick={handleCancel}
            disabled={!!(errorMessage || notificationMessage)}
          >
            <CloseIcon />
          </IconButton>
        )}
      </DialogTitle>
      <DialogContent>
        {errorMessage && (
          <Alert severity="error" sx={ALERT_STYLES}>
            {errorMessage}
          </Alert>
        )}
        {notificationMessage && (
          <Alert severity="info" sx={ALERT_STYLES}>
            {notificationMessage}
          </Alert>
        )}
        <Stack
          direction="row"
          position="relative"
          alignItems="center"
          spacing={1}
          justifyContent="space-around"
        >
          <TextField
            autoFocus
            variant="filled"
            margin="dense"
            id="open-dialog-search"
            label="🔍 Search"
            type="text"
            size="small"
            sx={SEARCH_STYLES(galleryOnly)}
            InputProps={SEARCH_INPUT_PROPS}
            onChange={handleDebouncedSearch}
          />
          {!galleryOnly && (
            <Button
              variant="contained"
              disableElevation
              sx={OPEN_DIALOG_BUTTON_STYLES}
              onClick={handleCreateNew}
            >
              Create Tyne
            </Button>
          )}
          <Button
            variant="contained"
            disableElevation
            color="secondary"
            sx={OPEN_DIALOG_BUTTON_STYLES}
            onClick={handleAccept}
            disabled={!selectedTyneId}
          >
            {actionDescription}
          </Button>
        </Stack>
        <br />
        <Stack direction="row" position="relative" justifyContent="space-between">
          {!galleryOnly && (
            <div className="open-dialog-nav-container">
              <OpenTyneTabsList
                tabs={OPEN_TYNE_TABS}
                selectedTab={activeTyneTab}
                onTabSelect={onTabChange}
                tyneTabCounters={tyneTabCounters}
              />
            </div>
          )}
          <div className="open-dialog-content-container">
            <OpenDialogDataViewer
              openTab={activeTyneTab}
              tynes={tynes}
              selectedTyneId={selectedTyneId}
              onTyneIdAccept={handleAccept}
              onTyneIdSelect={setSelectedTyneId}
              galleryOnly={galleryOnly}
            />
          </div>
        </Stack>
      </DialogContent>
    </NeptyneDialog>
  );
};

interface OpenTyneTabsListProps {
  tabs: OpenTyneTab[];
  selectedTab: OpenTyneTab;
  tyneTabCounters: Record<OpenTyneTab, number>;
  onTabSelect: (selectedTab: OpenTyneTab) => void;
}

export const OpenTyneTabsList: FunctionComponent<OpenTyneTabsListProps> = ({
  tabs,
  selectedTab,
  tyneTabCounters,
  onTabSelect,
}) => (
  <List component="nav" aria-label="main mailbox folders" sx={LIST_STYLES}>
    {tabs.map((tab) => (
      <OpenTyneTabsListItem
        key={tab}
        name={tab}
        count={tyneTabCounters[tab]}
        isSelected={tab === selectedTab}
        onTabSelect={onTabSelect}
      />
    ))}
  </List>
);

interface OpenTyneTabsListItemProps {
  name: OpenTyneTab;
  count: number;
  isSelected: boolean;
  onTabSelect: (tabName: OpenTyneTab) => void;
}

const OpenTyneTabsListItem: FunctionComponent<OpenTyneTabsListItemProps> = ({
  name,
  count,
  isSelected,
  onTabSelect,
}) => {
  const handleClick = useCallback(() => onTabSelect(name), [name, onTabSelect]);
  const primaryTypographyProps = useMemo(
    () => ({
      sx: isSelected ? SELECTED_LIST_ITEM_TEXT_STYLES : LIST_ITEM_TEXT_STYLES,
    }),
    [isSelected]
  );
  return (
    <ListItemButton selected={isSelected} onClick={handleClick} sx={LIST_ITEM_STYLES}>
      <ListItemText
        primary={`${name} (${count})`}
        primaryTypographyProps={primaryTypographyProps}
      />
    </ListItemButton>
  );
};
