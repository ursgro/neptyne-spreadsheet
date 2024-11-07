import { FunctionComponent, useCallback, useEffect, useMemo, useState } from "react";

import { TyneAction } from "../../SheetUtils";
import authenticatedFetch from "../../authenticatedFetch";
import { TyneListItem } from "../../NeptyneProtocol";
import {
  OPEN_TYNE_TAB_CATEGORIES,
  OPEN_TYNE_TABS,
  OpenDialog,
  OpenTyneTab,
} from "./OpenDialog";
import { NewUserDialog } from "../NewUserDialog";
import { User } from "../../user-context";
import { Alert, Dialog } from "@mui/material";

export type AllowAnonymous = "yes" | "no" | "auto_login";

export interface OpenTyneDialogDataWrapperProps {
  user: User | null;
  allowAnonymous: AllowAnonymous;
  errorMessage: string | null;
  notificationMessage: string | null;
  onTyneAction: (action: TyneAction, filename?: string) => void;
  onClose: () => void;
  galleryOnly?: boolean;
  tyneId: string;
}

export const OpenTyneDialogDataWrapper: FunctionComponent<
  OpenTyneDialogDataWrapperProps
> = ({
  user,
  allowAnonymous,
  errorMessage,
  notificationMessage,
  onTyneAction,
  onClose,
  galleryOnly,
  tyneId,
}) => {
  const [isLoading, setLoadingState] = useState(true);
  const [tynes, setTynes] = useState<TyneListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>();
  const [activeTab, setActiveTab] = useState<OpenTyneTab>(OPEN_TYNE_TABS[0]);
  const [nuxShowGallery, setNuxShowGallery] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const showGalleryOnly = galleryOnly || nuxShowGallery;
  const filterCategory = showGalleryOnly ? "Gallery" : activeTab;

  const handleClose = useCallback(
    (fileName?: string) => {
      if (fileName) {
        if (fileName === "_new") {
          onTyneAction(TyneAction.New);
        } else {
          onTyneAction(TyneAction.Open, fileName);
        }
      }

      onClose();
    },
    [onClose, onTyneAction]
  );

  const handleTabChange = useCallback(
    (newTab: OpenTyneTab) => setActiveTab(newTab),
    []
  );

  useEffect(() => {
    if (user === null || user.isAnonymous) {
      return;
    }
    setLoadingState(true);
    authenticatedFetch(user, "/api/tyne_list")
      .then((response) => {
        if (response.ok) {
          return response.json();
        } else if (response.status === 401) {
          throw new Error("Invalid token");
        }
      })
      .then((data: { tynes: TyneListItem[] }) => {
        const tynes = data.tynes.map((value) => {
          value.lastModified = new Date(value.lastModified);
          if (value.lastOpened) {
            value.lastOpened = new Date(value.lastOpened);
          }
          return value;
        });
        setTynes(tynes);
      })
      .catch((error) => {
        setFetchError(error.message);
      })
      .finally(() => {
        setLoadingState(false);
      });
  }, [user]);

  const tyneTabCounters = useMemo(
    () =>
      tynes.reduce(
        (acc: Record<OpenTyneTab, number>, tyne) => {
          OPEN_TYNE_TABS.filter((tab) =>
            tyne.categories.includes(OPEN_TYNE_TAB_CATEGORIES[tab])
          ).forEach((tab) => acc[tab]++);
          return acc;
        },
        {
          "Authored by me": 0,
          "Shared with me": 0,
          Gallery: 0,
        }
      ),
    [tynes]
  );

  const filteredTynes = useMemo(
    () =>
      tynes.filter(({ categories }) =>
        categories.includes(OPEN_TYNE_TAB_CATEGORIES[filterCategory])
      ),
    [tynes, filterCategory]
  );

  const searchedTynes = useMemo(
    () =>
      searchQuery
        ? filteredTynes.filter((tyne) => matchesSearchQuery(tyne, searchQuery))
        : filteredTynes,
    [filteredTynes, searchQuery]
  );

  if (user === null || user.isAnonymous) {
    return <h1>Something went wrong! No user</h1>;
  }

  if (isLoading) return null;

  if (fetchError) {
    console.log("Error fetching tynes", fetchError);
    return (
      <Dialog open={true}>
        <Alert severity="error">{fetchError}</Alert>
      </Dialog>
    );
  }

  const isNewUser = tyneTabCounters["Authored by me"] === 0;
  if (isNewUser && !nuxShowGallery) {
    return <NewUserDialog showGallery={() => setNuxShowGallery(true)} />;
  }

  return (
    <OpenDialog
      open
      errorMessage={errorMessage}
      notificationMessage={notificationMessage}
      activeTyneTab={filterCategory}
      tynes={searchedTynes}
      tyneTabCounters={tyneTabCounters}
      onTabChange={handleTabChange}
      onClose={handleClose}
      onSearch={setSearchQuery}
      galleryOnly={!!galleryOnly || nuxShowGallery}
      preventClose={tyneId === ""}
    />
  );
};

export const matchesSearchQuery = (
  { name }: TyneListItem,
  searchQuery: string
): boolean => name.toLowerCase().includes(searchQuery.trim().toLowerCase());

export const OpenGalleryDataWrapper: FunctionComponent<
  OpenTyneDialogDataWrapperProps
> = (props) => <OpenTyneDialogDataWrapper {...props} galleryOnly={true} />;
