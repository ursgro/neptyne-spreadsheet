import { getGSheetAppConfig } from "./gsheet_app_config";
import { User } from "./user-context";

type Info = Parameters<typeof fetch>[0];
type Init = { forceTokenRefresh?: boolean } & Parameters<typeof fetch>[1];

const urlWithoutDomain = (url: string): boolean => {
  return url.startsWith("/") && !url.startsWith("//");
};

const authenticatedFetch = (
  user: User | null,
  info: Info,
  init?: Init
): ReturnType<typeof fetch> => {
  const { forceTokenRefresh, ...fetchInit } = init
    ? init
    : { forceTokenRefresh: false };

  let updatedInfo: string | Request = info;
  const { serverUrlBase, authToken, projectId, inGSMode } = getGSheetAppConfig();

  if (serverUrlBase) {
    if (typeof info === "string" && urlWithoutDomain(info)) {
      updatedInfo = serverUrlBase + info;
    } else if (info instanceof Request && urlWithoutDomain(info.url)) {
      updatedInfo = new Request(serverUrlBase + info.url, info);
    }
  }

  const token =
    sessionStorage.getItem("sharedSecret") ||
    localStorage.getItem("token") ||
    localStorage.getItem("sharedSecret");
  const headers = fetchInit.headers || new Headers();
  const moreHeaders: { [key: string]: string } = {
    Authorization: token ? `Bearer ${token}` : "",
  };
  if (authToken) {
    moreHeaders["X-Neptyne-GSheet-Auth-Token"] = authToken;
  }
  if (projectId) {
    moreHeaders["X-Neptyne-Project-Id"] = projectId;
  }
  if (inGSMode) {
    moreHeaders["X-Neptyne-GSMode"] = "true";
  }
  moreHeaders["ngrok-skip-browser-warning"] = "true";

  return fetch(updatedInfo, {
    ...fetchInit,
    mode: "cors",
    headers: { ...headers, ...moreHeaders },
  });
};

export default authenticatedFetch;

export const ensureUser = (user: User | null): User => {
  if (user === null) {
    throw new Error("Anonymous user is not allowed here");
  }
  return user;
};
