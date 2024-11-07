import { createContext, useContext } from "react";
import posthog from "posthog-js";

export interface FeatureFlags {
  isFeatureEnabled: (featureName: string) => boolean;
}

export const defaultFeatures: FeatureFlags = {
  isFeatureEnabled: () => window.location.hostname === "localhost",
};

export const posthogFeatureFlags: FeatureFlags = {
  isFeatureEnabled: (featureName: string) => {
    return !!posthog.isFeatureEnabled(featureName);
  },
};

export const FeatureFlagsContext = createContext<FeatureFlags>(defaultFeatures);

export const useFeatureFlags = () => useContext(FeatureFlagsContext);
