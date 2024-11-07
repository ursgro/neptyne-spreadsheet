import { createContext, useContext } from "react";
import { UserViewState } from "./NeptyneProtocol";

type ContextType = [UserViewState, (newState: UserViewState) => void];

export const ViewStateContext = createContext<ContextType>([{}, () => {}]);

export const useViewState = () => useContext(ViewStateContext);
