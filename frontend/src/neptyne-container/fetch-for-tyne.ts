import authenticatedFetch, { ensureUser } from "../authenticatedFetch";
import { TyneAction } from "../SheetUtils";
import { RemoteTyne } from "./NeptyneContainer";
import { GoogleDriveDoc } from "../google-drive";
import { getGSheetAppConfig } from "../gsheet_app_config";
import { User } from "../user-context";

export const TUTORIAL_TYNE_ID = "tutorial";

const _fetchForTyne = (
  user: User | null,
  action: TyneAction,
  payload: string | undefined | File | GoogleDriveDoc,
  tyneId: string
) => {
  const { serverUrlBase, gsheetTimeZone } = getGSheetAppConfig();
  const formData = new FormData();
  if (gsheetTimeZone) {
    formData.append("tz", gsheetTimeZone);
  } else {
    formData.append("tz", Intl.DateTimeFormat().resolvedOptions().timeZone);
  }
  switch (action) {
    case TyneAction.New:
      return authenticatedFetch(ensureUser(user), "/api/tyne_new", { method: "POST" });
    case TyneAction.OpenLinkedForGsheet:
      if (gsheetTimeZone) {
        formData.append("time_zone", gsheetTimeZone);
      }
      const domain = serverUrlBase || "";
      return authenticatedFetch(
        ensureUser(user),
        `${domain}/api/get_gsheet_connected_tyne/` + payload,
        { method: "POST", body: formData }
      );
    case TyneAction.Open:
      if (payload === "welcome" && user !== null) {
        // Special case welcome - copy so the user feels special
        const name = user.displayName ?? user.email;
        formData.append("name", `${name}'s First Tyne`);
        return authenticatedFetch(user, "/api/tyne_copy_if_readonly/" + payload, {
          method: "POST",
          body: formData,
        });
      } else {
        if (payload === TUTORIAL_TYNE_ID && user !== null) {
          const name = user.displayName ?? user.email;
          formData.append("name", name ? `${name}'s Tutorial Tyne` : "Tutorial Tyne");
          return authenticatedFetch(user, "/api/tyne_copy_if_readonly/" + payload, {
            method: "POST",
            body: formData,
          });
        } else {
          const fetchFn = user === null ? fetch : authenticatedFetch.bind(null, user);
          return fetchFn(
            "/api/tyne_get/" + payload + `?${new URLSearchParams(formData as any)}`
          );
        }
      }

    case TyneAction.Import:
      formData.append("notebook", payload as File);
      return authenticatedFetch(ensureUser(user), "/api/tyne_import", {
        method: "POST",
        body: formData,
      });
    case TyneAction.ImportGoogle:
      const { url, authPayload } = payload as GoogleDriveDoc;
      formData.append("url", url);
      formData.append("authPayload", JSON.stringify(authPayload));
      return authenticatedFetch(ensureUser(user), "/api/tyne_import_google", {
        method: "POST",
        body: formData,
      });

    case TyneAction.Copy:
      formData.append("name", payload as string);
      return authenticatedFetch(ensureUser(user), "/api/tyne_copy/" + tyneId, {
        method: "POST",
        body: formData,
      });
    case TyneAction.Clone:
      formData.append("copyTyneId", payload as string);
      return authenticatedFetch(ensureUser(user), "/api/tyne_copy/" + tyneId, {
        method: "POST",
        body: formData,
      });
  }
};

export const fetchForTyne = (
  user: User | null,
  action: TyneAction,
  payload: string | undefined | File | GoogleDriveDoc,
  tyneId: string
): Promise<{
  remoteTyne: RemoteTyne;
}> =>
  _fetchForTyne(user, action, payload, tyneId).then((response) => {
    if (!response.ok) {
      let errorMessage: string;
      if (response.status === 404) {
        errorMessage = "Tyne cannot be found";
      } else if (response.status === 403) {
        errorMessage = "You don't have access to that tyne";
      } else if (response.status === 400) {
        errorMessage = response.statusText;
      } else {
        errorMessage = "A server error occurred";
        console.error(response);
      }
      return Promise.reject(errorMessage);
    }
    return Promise.resolve(response.json());
  });
