import isEqual from "lodash/isEqual";
import sortBy from "lodash/sortBy";
import { FunctionComponent, useCallback, useEffect, useState } from "react";
import {
  AccessLevel,
  AccessScope,
  ShareRecord,
  TyneShareResponse,
} from "../NeptyneProtocol";
import authenticatedFetch from "../authenticatedFetch";
import ShareDialog from "./ShareDialog";
import { User } from "../user-context";

export interface ShareDialogDataWrapperProps {
  user: User | null;
  tyneId: string;
  tyneName: string;
  onClose: () => void;
}

export const ShareDialogDataWrapper: FunctionComponent<ShareDialogDataWrapperProps> = ({
  user,
  tyneId,
  tyneName,
  onClose,
}) => {
  const [shareRecords, setShareRecords] = useState<TyneShareResponse | null>({
    shares: [],
    users: [],
    generalAccessLevel: AccessLevel.View,
    generalAccessScope: AccessScope.Restricted,
    description: "",
    isApp: false,
  });

  const [canAccessShareRecords, setCanAccessShareRecords] = useState<boolean>(false);

  useEffect(() => {
    if (user === null) {
      return;
    }
    const url = "/api/tynes/" + tyneId + "/share";
    authenticatedFetch(user, url).then((response) => {
      response.json().then((records) => {
        setShareRecords(records);
        setCanAccessShareRecords(true);
      });
    });
  }, [tyneId, user]);

  const saveShareRecords = useCallback(
    (payload: TyneShareResponse) => {
      if (user === null) {
        return;
      }
      const url = "/api/tynes/" + tyneId + "/share";
      const keys = ["email", "access_level"];
      const records = payload.shares;
      if (
        (records === null ||
          isEqual(sortBy(records, keys), sortBy(shareRecords, keys))) &&
        payload.description === shareRecords!.description
      ) {
        return;
      }
      authenticatedFetch(user, url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((response) => {
        response.text().then((value) => {
          if (!response.ok) {
            console.error("error sharing tyne:", value);
          }
        });
      });
    },
    [tyneId, user, shareRecords]
  );

  return (
    <ShareDialog
      open
      loading={shareRecords === null}
      users={shareRecords ? shareRecords.users : EMPTY_SHARE_RECORDS}
      tyneDescription={shareRecords?.description ?? ""}
      tyneName={tyneName}
      generalAccessLevel={shareRecords?.generalAccessLevel ?? AccessLevel.View}
      generalAccessScope={shareRecords?.generalAccessScope ?? AccessScope.Restricted}
      onSubmit={(response) => {
        saveShareRecords(response);
        onClose();
      }}
      onClose={onClose}
      shares={shareRecords ? shareRecords.shares : EMPTY_SHARE_RECORDS}
      canAccessShareRecords={canAccessShareRecords}
      isApp={shareRecords?.isApp ?? false}
    />
  );
};

const EMPTY_SHARE_RECORDS: ShareRecord[] = [];

Object.freeze(EMPTY_SHARE_RECORDS);
