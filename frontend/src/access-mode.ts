import { createContext, useContext } from "react";
import { AccessMode } from "./NeptyneProtocol";

export const AccessModeContext = createContext<AccessMode>(
  AccessMode.ReadOnlyDisconnected
);

export const useAccessMode = () => useContext(AccessModeContext);
