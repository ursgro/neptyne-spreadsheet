import { createContext, useContext } from "react";

export const loadToken = (): string | null =>
  sessionStorage.getItem("sharedSecret") ||
  localStorage.getItem("token") ||
  localStorage.getItem("sharedSecret");

export interface User {
  displayName: string | null;
  email: string | null;
  emailVerified: boolean;
  isAnonymous: boolean;
  providerData: any[];
  getIdToken: () => Promise<string>;
  photoURL: string | null;
  uid: string;
  phoneNumber: string | null;
}

export interface UserInfo {
  user: User | null;
  organizationName: string | null;
  fetch: typeof fetch | null;
}

export const UserInfoContext = createContext<UserInfo>({
  user: null,
  organizationName: null,
  fetch: null,
});

export const useUserInfo = () => useContext(UserInfoContext);

export const singleUser: User = {
  displayName: "Test User",
  email: "neptyne-user@example.com",
  emailVerified: true,
  isAnonymous: false,
  providerData: [],
  getIdToken: async () => loadToken() || "",
  photoURL: null,
  uid: "test-uid",
  phoneNumber: null,
};
