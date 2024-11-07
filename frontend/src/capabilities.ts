import { createContext, useContext } from "react";

export interface Capabilities {
  minTickFrequencySeconds: number;
  hasPremium: boolean;
  canUseNKS: boolean;
}

export const defaultCapabilities: Capabilities = {
  minTickFrequencySeconds: 24 * 60 * 60,
  hasPremium: false,
  canUseNKS: false,
};

export const CapabilitiesContext = createContext<Capabilities>(defaultCapabilities);

export const useCapabilities = () => useContext(CapabilitiesContext);
